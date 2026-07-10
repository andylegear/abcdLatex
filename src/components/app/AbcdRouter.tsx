// src/components/app/AbcdRouter.tsx
//
// Replacement router for the ABCD GitHub-first workflow.
// Shows: Landing (recent projects) → Connect → File Browser → Editor
// Bypasses the default Yjs/WebRTC collab entry point.
//
import type React from 'react';
import { useState, useCallback, useEffect, lazy, Suspense } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { gitHubSyncService, type ConflictInfo } from '../../services/GitHubSyncService';
import { tokenStore } from '../../services/TokenStore';
import { collabService } from '../../services/CollabService';
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
	const { isAuthenticated, isInitializing, createProject } = useAuth();
	const [view, setView] = useState<View>('landing');
	const [showHelp, setShowHelp] = useState(false);
	const [conflict, setConflict] = useState<ConflictInfo | null>(null);
	const [commitPrompt, setCommitPrompt] = useState(false);
	const [commitMessage, setCommitMessage] = useState('');
	const [currentFile, setCurrentFile] = useState('');
	const [docUrl, setDocUrl] = useState<YjsDocUrl | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	// Determine initial view
	useEffect(() => {
		if (isInitializing) return;
		const hasToken = !!tokenStore.getToken();
		const hasProjects = tokenStore.getRecentProjects().length > 0;
		setView(hasToken && hasProjects ? 'landing' : 'connect');
	}, [isInitializing]);

	// Create a local Yjs project to host the file content in TeXlyre's editor
	const setupEditorProject = useCallback(async (content: string, filePath: string) => {
		try {
			setIsLoading(true);
			// Generate a unique project ID for local use
			const projectId = `github-${Date.now().toString(36)}`;
			const yjsUrl = `yjs:${projectId}` as YjsDocUrl;

			// Create a project entry in TeXlyre's local auth/project system
			if (isAuthenticated) {
				await createProject({
					name: filePath.split('/').pop() || 'Untitled',
					description: `GitHub: ${gitHubSyncService.getConnectionInfo().owner}/${gitHubSyncService.getConnectionInfo().repo}`,
					type: filePath.endsWith('.typ') ? 'typst' : 'latex',
					docUrl: yjsUrl,
					tags: ['github'],
					isFavorite: false,
				});
			}

			// Initialize file storage and store the file content
			await fileStorageService.initialize(yjsUrl);
			await fileStorageService.storeFile({
				id: `file-${Math.random().toString(36).slice(2)}`,
				name: filePath.split('/').pop() || 'main.tex',
				path: '/' + filePath.split('/').pop(),
				type: 'file',
				lastModified: Date.now(),
				size: content.length,
				mimeType: 'text/x-latex',
				isBinary: false,
				content,
				isDeleted: false,
			}, { showConflictDialog: false, preserveTimestamp: false });

			setDocUrl(yjsUrl);
			setCurrentFile(filePath);
			setView('editor');
		} catch (err) {
			console.error('Failed to set up editor project:', err);
			alert('Failed to open file in editor');
		} finally {
			setIsLoading(false);
		}
	}, [isAuthenticated, createProject]);

	const handleFileOpen = useCallback(async (owner: string, repo: string, branch: string, filePath: string) => {
		try {
			setIsLoading(true);
			const fileInfo = await gitHubSyncService.loadFile(owner, repo, branch, filePath);
			await setupEditorProject(fileInfo.content, filePath);
		} catch (err) {
			alert(`Failed to load file: ${err instanceof Error ? err.message : 'Unknown error'}`);
			setIsLoading(false);
		}
	}, [setupEditorProject]);

	const handleOpenProject = useCallback(async (owner: string, repo: string, branch: string, lastFile: string | null) => {
		if (lastFile) {
			await handleFileOpen(owner, repo, branch, lastFile);
		} else {
			setView('connect');
		}
	}, [handleFileOpen]);

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
					<span className="abcd-logo-text">ABCD</span>
					<span className="abcd-title">LaTeX</span>
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
						title="Help"
					>
						?
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
