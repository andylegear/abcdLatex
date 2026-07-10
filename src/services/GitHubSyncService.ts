// src/services/GitHubSyncService.ts

import { draftStore } from './DraftStore';
import { tokenStore } from './TokenStore';

export interface GitHubFileInfo {
	path: string;
	sha: string;
	content: string;
	size: number;
}

export interface FileListItem {
	name: string;
	path: string;
	type: 'file' | 'dir';
	sha: string;
}

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'conflict' | 'error';

export interface ConflictInfo {
	localContent: string;
	remoteContent: string;
	remoteSha: string;
	filePath: string;
}

type StatusListener = (status: SaveStatus) => void;

class GitHubSyncService {
	private baseUrl = 'https://api.github.com';
	private currentOwner = '';
	private currentRepo = '';
	private currentBranch = 'main';
	private currentFilePath = '';
	private currentSha = '';
	private status: SaveStatus = 'idle';
	private statusListeners: StatusListener[] = [];
	private autoCommitTimer: ReturnType<typeof setTimeout> | null = null;
	private draftTimer: ReturnType<typeof setTimeout> | null = null;
	private lastEditTime = 0;
	private currentContent = '';

	private setStatus(status: SaveStatus): void {
		this.status = status;
		for (const listener of this.statusListeners) {
			listener(status);
		}
	}

	getStatus(): SaveStatus {
		return this.status;
	}

	addStatusListener(listener: StatusListener): () => void {
		this.statusListeners.push(listener);
		return () => {
			this.statusListeners = this.statusListeners.filter((l) => l !== listener);
		};
	}

	getConnectionInfo() {
		return {
			owner: this.currentOwner,
			repo: this.currentRepo,
			branch: this.currentBranch,
			filePath: this.currentFilePath,
		};
	}

	private async apiRequest<T>(
		path: string,
		options: RequestInit = {},
	): Promise<T> {
		const token = tokenStore.getToken();
		if (!token) throw new Error('No GitHub token configured');

		const response = await fetch(`${this.baseUrl}${path}`, {
			...options,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
				...((options.headers as Record<string, string>) || {}),
			},
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				`GitHub API error ${response.status}: ${(errorData as { message?: string }).message || response.statusText}`,
			);
		}

		if (response.status === 204) return null as T;
		return response.json() as Promise<T>;
	}

	async testConnection(): Promise<{ login: string; avatar_url: string }> {
		return this.apiRequest('/user');
	}

	async listFiles(
		owner: string,
		repo: string,
		branch: string,
		path = '',
	): Promise<FileListItem[]> {
		const encodedPath = path ? `/${encodeURIComponent(path)}` : '';
		const items = await this.apiRequest<Array<{
			name: string;
			path: string;
			type: string;
			sha: string;
		}>>(`/repos/${owner}/${repo}/contents${encodedPath}?ref=${branch}`);

		return items.map((item) => ({
			name: item.name,
			path: item.path,
			type: item.type as 'file' | 'dir',
			sha: item.sha,
		}));
	}

	async listBranches(owner: string, repo: string): Promise<string[]> {
		const branches = await this.apiRequest<Array<{ name: string }>>(
			`/repos/${owner}/${repo}/branches`,
		);
		return branches.map((b) => b.name);
	}

	async loadRepoTree(
		owner: string,
		repo: string,
		branch: string,
	): Promise<Array<{ path: string; type: 'blob' | 'tree'; sha: string; size?: number }>> {
		const data = await this.apiRequest<{
			tree: Array<{ path: string; type: string; sha: string; size?: number }>;
		}>(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);

		return data.tree
			.filter((item) => item.type === 'blob')
			.map((item) => ({
				path: item.path,
				type: item.type as 'blob' | 'tree',
				sha: item.sha,
				size: item.size,
			}));
	}

	async loadFileContent(
		owner: string,
		repo: string,
		branch: string,
		filePath: string,
	): Promise<{ content: string; sha: string }> {
		const data = await this.apiRequest<{
			content: string;
			sha: string;
			encoding: string;
		}>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`);

		const content = data.encoding === 'base64'
			? decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))
			: data.content;

		return { content, sha: data.sha };
	}

	async loadFile(
		owner: string,
		repo: string,
		branch: string,
		filePath: string,
	): Promise<GitHubFileInfo> {
		const data = await this.apiRequest<{
			content: string;
			sha: string;
			size: number;
			encoding: string;
		}>(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`);

		const content = data.encoding === 'base64'
			? decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))
			: data.content;

		this.currentOwner = owner;
		this.currentRepo = repo;
		this.currentBranch = branch;
		this.currentFilePath = filePath;
		this.currentSha = data.sha;
		this.currentContent = content;
		this.setStatus('idle');

		// Save initial draft
		await draftStore.saveDraft(owner, repo, branch, filePath, content);

		// Update recent projects
		tokenStore.addRecentProject({ owner, repo, branch, lastFile: filePath });

		return { path: filePath, sha: data.sha, content, size: data.size };
	}

	onContentChange(content: string): void {
		this.currentContent = content;
		this.lastEditTime = Date.now();

		if (this.status !== 'unsaved') {
			this.setStatus('unsaved');
		}

		// Debounced draft save (2 seconds after last keystroke)
		if (this.draftTimer) clearTimeout(this.draftTimer);
		this.draftTimer = setTimeout(() => {
			draftStore.saveDraft(
				this.currentOwner,
				this.currentRepo,
				this.currentBranch,
				this.currentFilePath,
				content,
			);
		}, 2000);

		// Reset auto-commit timer
		this.resetAutoCommitTimer();
	}

	private resetAutoCommitTimer(): void {
		if (this.autoCommitTimer) clearTimeout(this.autoCommitTimer);
		const minutes = tokenStore.getAutoCommitMinutes();
		if (minutes <= 0) return;

		this.autoCommitTimer = setTimeout(async () => {
			if (this.status === 'unsaved' && this.currentContent !== '') {
				const message = `Autosave: ${this.currentFilePath} — ${new Date().toISOString()}`;
				await this.commitFile(this.currentContent, message);
			}
		}, minutes * 60 * 1000);
	}

	async commitFile(
		content: string,
		message: string,
	): Promise<{ success: boolean; conflict?: ConflictInfo }> {
		this.setStatus('saving');

		try {
			// Re-fetch current SHA to detect conflicts
			const currentData = await this.apiRequest<{ sha: string; content: string; encoding: string }>(
				`/repos/${this.currentOwner}/${this.currentRepo}/contents/${encodeURIComponent(this.currentFilePath)}?ref=${this.currentBranch}`,
			);

			if (currentData.sha !== this.currentSha) {
				// Conflict detected
				const remoteContent = currentData.encoding === 'base64'
					? decodeURIComponent(escape(atob(currentData.content.replace(/\n/g, ''))))
					: currentData.content;

				this.setStatus('conflict');
				return {
					success: false,
					conflict: {
						localContent: content,
						remoteContent,
						remoteSha: currentData.sha,
						filePath: this.currentFilePath,
					},
				};
			}

			// No conflict — commit
			const encoded = btoa(unescape(encodeURIComponent(content)));
			const result = await this.apiRequest<{ content: { sha: string } }>(
				`/repos/${this.currentOwner}/${this.currentRepo}/contents/${encodeURIComponent(this.currentFilePath)}`,
				{
					method: 'PUT',
					body: JSON.stringify({
						message,
						content: encoded,
						sha: this.currentSha,
						branch: this.currentBranch,
					}),
				},
			);

			this.currentSha = result.content.sha;
			this.currentContent = content;
			this.setStatus('saved');

			// Clear local draft
			await draftStore.clearDraft(
				this.currentOwner,
				this.currentRepo,
				this.currentBranch,
				this.currentFilePath,
			);

			// Reset to idle after brief "saved" display
			setTimeout(() => {
				if (this.status === 'saved') this.setStatus('idle');
			}, 3000);

			return { success: true };
		} catch (error) {
			this.setStatus('error');
			throw error;
		}
	}

	async forceOverwrite(content: string, remoteSha: string, message: string): Promise<void> {
		const encoded = btoa(unescape(encodeURIComponent(content)));
		const result = await this.apiRequest<{ content: { sha: string } }>(
			`/repos/${this.currentOwner}/${this.currentRepo}/contents/${encodeURIComponent(this.currentFilePath)}`,
			{
				method: 'PUT',
				body: JSON.stringify({
					message,
					content: encoded,
					sha: remoteSha,
					branch: this.currentBranch,
				}),
			},
		);

		this.currentSha = result.content.sha;
		this.currentContent = content;
		this.setStatus('saved');

		await draftStore.clearDraft(
			this.currentOwner,
			this.currentRepo,
			this.currentBranch,
			this.currentFilePath,
		);
	}

	async createBranchAndCommit(
		content: string,
		newBranch: string,
		message: string,
	): Promise<void> {
		// Get the current branch's HEAD commit SHA
		const refData = await this.apiRequest<{ object: { sha: string } }>(
			`/repos/${this.currentOwner}/${this.currentRepo}/git/ref/heads/${this.currentBranch}`,
		);

		// Create new branch from current HEAD
		await this.apiRequest(
			`/repos/${this.currentOwner}/${this.currentRepo}/git/refs`,
			{
				method: 'POST',
				body: JSON.stringify({
					ref: `refs/heads/${newBranch}`,
					sha: refData.object.sha,
				}),
			},
		);

		// Get the file's SHA on the new branch (same as current)
		const fileData = await this.apiRequest<{ sha: string }>(
			`/repos/${this.currentOwner}/${this.currentRepo}/contents/${encodeURIComponent(this.currentFilePath)}?ref=${newBranch}`,
		);

		// Commit to new branch
		const encoded = btoa(unescape(encodeURIComponent(content)));
		await this.apiRequest(
			`/repos/${this.currentOwner}/${this.currentRepo}/contents/${encodeURIComponent(this.currentFilePath)}`,
			{
				method: 'PUT',
				body: JSON.stringify({
					message,
					content: encoded,
					sha: fileData.sha,
					branch: newBranch,
				}),
			},
		);

		this.currentBranch = newBranch;
		this.setStatus('saved');
	}

	async reloadFile(): Promise<string> {
		const info = await this.loadFile(
			this.currentOwner,
			this.currentRepo,
			this.currentBranch,
			this.currentFilePath,
		);
		return info.content;
	}

	disconnect(): void {
		if (this.autoCommitTimer) clearTimeout(this.autoCommitTimer);
		if (this.draftTimer) clearTimeout(this.draftTimer);
		this.currentOwner = '';
		this.currentRepo = '';
		this.currentBranch = 'main';
		this.currentFilePath = '';
		this.currentSha = '';
		this.currentContent = '';
		this.setStatus('idle');
	}
}

export const gitHubSyncService = new GitHubSyncService();
