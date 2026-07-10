// src/components/app/AbcdRouter.tsx
//
// Replacement router for the ABCD GitHub-first workflow.
// Shows: Landing (recent projects) → Connect → File Browser → Editor
// Bypasses the default Yjs/WebRTC collab entry point.
//
import type React from 'react';
import { useState, useCallback, useEffect, lazy, Suspense } from 'react';

import abcdLogo from '../../assets/images/abcd-logo.jpg';
import { useAuth } from '../../hooks/useAuth';
import { gitHubSyncService, type ConflictInfo } from '../../services/GitHubSyncService';
import { tokenStore } from '../../services/TokenStore';
import { fileStorageService } from '../../services/FileStorageService';
import type { YjsDocUrl } from '../../types/yjs';
import ConnectionPanel from '../github/ConnectionPanel';
import RecentProjects from '../github/RecentProjects';
import ConflictDialog from '../github/ConflictDialog';
import SaveStatusIndicator from '../github/SaveStatus';
import HelpPage from '../github/HelpPage';
import OnboardingTour from '../github/OnboardingTour';
import LoadingScreen from './LoadingScreen';

const EditorApp = lazy(() => import('./EditorApp'));

type View = 'landing' | 'connect' | 'editor';

const AbcdRouter: React.FC = () => {
	const { isAuthenticated, isInitializing, createProject, createGuestAccount } = useAuth();
	const [view, setView] = useState<View>('landing');
	const [showHelp, setShowHelp] = useState(false);
	const [conflict, setConflict] = useState<ConflictInfo | null>(null);
	const [commitPrompt, setCommitPrompt] = useState(false);
	const [commitMessage, setCommitMessage] = useState('');
	const [currentFile, setCurrentFile] = useState('');
	const [docUrl, setDocUrl] = useState<YjsDocUrl | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	// Auto-create a local guest account if not authenticated
	useEffect(() => {
		if (isInitializing) return;
		if (!isAuthenticated) {
			createGuestAccount().catch((err) =>
				console.warn('Failed to create guest account:', err)
			);
		}
	}, [isInitializing, isAuthenticated, createGuestAccount]);

	// Determine initial view and show help on first visit
	useEffect(() => {
		if (isInitializing) return;
		const hasToken = !!tokenStore.getToken();
		const hasProjects = tokenStore.getRecentProjects().length > 0;
		setView(hasToken && hasProjects ? 'landing' : 'connect');

		// Show help page automatically on first ever visit
		if (!tokenStore.isTourSeen()) {
			setShowHelp(true);
		}
	}, [isInitializing]);

	// Create a local Yjs project and load ALL repo files into it
	const setupEditorProject = useCallback(async (owner: string, repo: string, branch: string) => {
		try {
			setIsLoading(true);
			// Ensure we have a local account
			if (!isAuthenticated) {
				await createGuestAccount();
			}
			// Use a valid UUID that passes TeXlyre's URL validation
			const projectId = crypto.randomUUID();
			const yjsUrl = `yjs:${projectId}` as YjsDocUrl;

			// Determine project type from file extensions in repo
			const tree = await gitHubSyncService.loadRepoTree(owner, repo, branch);
			const hasTypst = tree.some(f => f.path.endsWith('.typ'));
			const projectType = hasTypst ? 'typst' : 'latex';

			// Create project entry
			await createProject({
				name: `${owner}/${repo}`,
				description: `GitHub: ${owner}/${repo} (${branch})`,
				type: projectType,
				docUrl: yjsUrl,
				tags: ['github'],
				isFavorite: false,
			});

			// Initialize file storage
			await fileStorageService.initialize(yjsUrl);

			// Load all text files from the repo (skip very large or binary files)
			const textExtensions = ['.tex', '.typ', '.bib', '.sty', '.cls', '.txt', '.md', '.json', '.yaml', '.yml', '.toml', '.cfg', '.ini', '.log', '.bst'];
			const filesToLoad = tree.filter(f =>
				textExtensions.some(ext => f.path.toLowerCase().endsWith(ext)) &&
				(f.size === undefined || f.size < 500000)
			);

			for (const file of filesToLoad) {
				try {
					const { content, sha } = await gitHubSyncService.loadFileContent(owner, repo, branch, file.path);
					const fileName = file.path.split('/').pop() || file.path;
					await fileStorageService.storeFile({
						id: `file-${Math.random().toString(36).slice(2, 15)}`,
						name: fileName,
						path: '/' + file.path,
						type: 'file',
						lastModified: Date.now(),
						size: content.length,
						mimeType: fileName.endsWith('.tex') ? 'text/x-latex' : 'text/plain',
						isBinary: false,
						content,
						isDeleted: false,
					}, { showConflictDialog: false, preserveTimestamp: false });
				} catch {
					// Skip files that fail to load (permissions, encoding issues)
				}
			}

			// Track connection info
			tokenStore.addRecentProject({ owner, repo, branch, lastFile: null });

			setDocUrl(yjsUrl);
			setCurrentFile(`${owner}/${repo}`);
			setView('editor');
		} catch (err) {
			console.error('Failed to set up editor project:', err);
			alert(`Failed to open project: ${err instanceof Error ? err.message : 'Unknown error'}`);
		} finally {
			setIsLoading(false);
		}
	}, [isAuthenticated, createProject, createGuestAccount]);

	const handleFileOpen = useCallback(async (owner: string, repo: string, branch: string, _filePath: string) => {
		// When a file is selected from the browser, load the whole repo as a project
		await setupEditorProject(owner, repo, branch);
	}, [setupEditorProject]);

	const handleOpenProject = useCallback(async (owner: string, repo: string, branch: string, _lastFile: string | null) => {
		await setupEditorProject(owner, repo, branch);
	}, [setupEditorProject]);

	// Save handler — gets current content from fileStorageService
	const handleSave = useCallback(async () => {
		setCommitPrompt(true);
	}, []);

	const handleCommitConfirm = useCallback(async () => {
		setCommitPrompt(false);
		try {
			// Get current file content from storage
			const files = await fileStorageService.getAllFiles();
			const mainFile = files.find(f => !f.isDeleted && !f.isBinary);
			if (!mainFile || !mainFile.content) return;

			const content = typeof mainFile.content === 'string' ? mainFile.content : new TextDecoder().decode(mainFile.content as ArrayBuffer);
			const message = commitMessage.trim() || `Update ${currentFile}`;

			const result = await gitHubSyncService.commitFile(content, message);
			if (!result.success && result.conflict) {
				setConflict(result.conflict);
			}
		} catch (err) {
			alert(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
		setCommitMessage('');
	}, [commitMessage, currentFile]);

	const handleOverwrite = useCallback(async (message: string) => {
		if (!conflict) return;
		try {
			const files = await fileStorageService.getAllFiles();
			const mainFile = files.find(f => !f.isDeleted && !f.isBinary);
			if (!mainFile || !mainFile.content) return;
			const content = typeof mainFile.content === 'string' ? mainFile.content : new TextDecoder().decode(mainFile.content as ArrayBuffer);
			await gitHubSyncService.forceOverwrite(content, conflict.remoteSha, message);
		} catch (err) {
			alert(`Overwrite failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
		setConflict(null);
	}, [conflict]);

	const handleReload = useCallback(async () => {
		try {
			const content = await gitHubSyncService.reloadFile();
			// Update the file in storage
			const files = await fileStorageService.getAllFiles();
			const mainFile = files.find(f => !f.isDeleted && !f.isBinary);
			if (mainFile) {
				await fileStorageService.storeFile({
					...mainFile,
					content,
					lastModified: Date.now(),
				}, { showConflictDialog: false, preserveTimestamp: false });
			}
		} catch (err) {
			alert(`Reload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
		setConflict(null);
	}, []);

	const handleSaveAsNewBranch = useCallback(async (branchName: string, message: string) => {
		try {
			const files = await fileStorageService.getAllFiles();
			const mainFile = files.find(f => !f.isDeleted && !f.isBinary);
			if (!mainFile || !mainFile.content) return;
			const content = typeof mainFile.content === 'string' ? mainFile.content : new TextDecoder().decode(mainFile.content as ArrayBuffer);
			await gitHubSyncService.createBranchAndCommit(content, branchName, message);
		} catch (err) {
			alert(`Branch creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
		setConflict(null);
	}, []);

	// Keyboard shortcut: Ctrl+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 's') {
				e.preventDefault();
				if (view === 'editor') handleSave();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleSave, view]);

	// Auto-commit: watch for content changes and trigger auto-commit timer
	useEffect(() => {
		if (view !== 'editor') return;
		let lastContent = '';
		let autoTimer: ReturnType<typeof setTimeout> | null = null;

		const checkInterval = setInterval(async () => {
			try {
				const files = await fileStorageService.getAllFiles();
				const mainFile = files.find(f => !f.isDeleted && !f.isBinary);
				if (!mainFile || !mainFile.content) return;
				const content = typeof mainFile.content === 'string' ? mainFile.content : new TextDecoder().decode(mainFile.content as ArrayBuffer);

				if (content !== lastContent) {
					lastContent = content;
					gitHubSyncService.onContentChange(content);

					// Reset auto-commit timer managed by the sync service
					if (autoTimer) clearTimeout(autoTimer);
				}
			} catch {
				// ignore
			}
		}, 3000);

		return () => {
			clearInterval(checkInterval);
			if (autoTimer) clearTimeout(autoTimer);
		};
	}, [view]);

	const handleBackToProjects = () => {
		gitHubSyncService.disconnect();
		setDocUrl(null);
		setCurrentFile('');
		setView('landing');
	};

	if (isInitializing || isLoading) {
		return <LoadingScreen />;
	}

	return (
		<>
			{/* ABCD Header */}
			<header className="abcd-header">
				<div className="abcd-header-left">
					<img src={abcdLogo} alt="ABCD" className="abcd-logo" />
					<span className="abcd-title">ABCD LaTeX</span>
					{view === 'editor' && (
						<button type="button" className="abcd-btn-back" onClick={handleBackToProjects}>
							← Projects
						</button>
					)}
				</div>
				<div className="abcd-header-center">
					{view === 'editor' && currentFile && (
						<span className="abcd-current-file">📄 {currentFile}</span>
					)}
				</div>
				<div className="abcd-header-right">
					{view === 'editor' && <SaveStatusIndicator onSave={handleSave} />}
					<button
						type="button"
						className="abcd-help-btn"
						onClick={() => setShowHelp(true)}
						title="Help & Getting Started"
					>
						? Help
					</button>
				</div>
			</header>

			{/* Main content */}
			{view === 'landing' && (
				<main className="abcd-main">
					<RecentProjects
						onOpenProject={handleOpenProject}
						onNewConnection={() => setView('connect')}
					/>
				</main>
			)}

			{view === 'connect' && (
				<main className="abcd-main">
					<ConnectionPanel onFileOpen={handleFileOpen} />
					<OnboardingTour />
				</main>
			)}

			{view === 'editor' && docUrl && (
				<Suspense fallback={<LoadingScreen />}>
					<EditorApp
						docUrl={docUrl}
						onBackToProjects={handleBackToProjects}
						onLogout={handleBackToProjects}
						targetDocId={null}
						targetFilePath={null}
					/>
				</Suspense>
			)}

			{/* Commit prompt */}
			{commitPrompt && (
				<div className="abcd-commit-overlay">
					<div className="abcd-commit-dialog">
						<h3>Commit to GitHub</h3>
						<div className="abcd-field">
							<label htmlFor="commit-msg">Commit message:</label>
							<input
								id="commit-msg"
								type="text"
								value={commitMessage}
								onChange={(e) => setCommitMessage(e.target.value)}
								placeholder="Describe your change"
								onKeyDown={(e) => e.key === 'Enter' && handleCommitConfirm()}
							/>
						</div>
						<div className="abcd-commit-actions">
							<button type="button" className="abcd-btn-primary" onClick={handleCommitConfirm}>
								Commit
							</button>
							<button type="button" className="abcd-btn-secondary" onClick={() => setCommitPrompt(false)}>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Conflict dialog */}
			{conflict && (
				<ConflictDialog
					conflict={conflict}
					onOverwrite={handleOverwrite}
					onReload={handleReload}
					onSaveAsNewBranch={handleSaveAsNewBranch}
					onCancel={() => setConflict(null)}
				/>
			)}

			{/* Help page */}
			{showHelp && <HelpPage onClose={() => setShowHelp(false)} />}
		</>
	);
};

export default AbcdRouter;
