// src/components/github/AbcdApp.tsx
import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
import abcdLogo from '../../assets/images/abcd-logo.jpg';
import { gitHubSyncService, type ConflictInfo } from '../../services/GitHubSyncService';
import { tokenStore } from '../../services/TokenStore';
import ConnectionPanel from './ConnectionPanel';
import RecentProjects from './RecentProjects';
import ConflictDialog from './ConflictDialog';
import SaveStatusIndicator from './SaveStatus';
import HelpPage from './HelpPage';
import OnboardingTour from './OnboardingTour';

interface AbcdAppProps {
	onFileReady: (content: string, filePath: string) => void;
	onContentUpdate?: (content: string) => void;
	editorContent?: string;
}

const AbcdApp: React.FC<AbcdAppProps> = ({ onFileReady, editorContent }) => {
	const [view, setView] = useState<'landing' | 'connect' | 'editor'>('landing');
	const [showHelp, setShowHelp] = useState(false);
	const [conflict, setConflict] = useState<ConflictInfo | null>(null);
	const [commitPrompt, setCommitPrompt] = useState(false);
	const [commitMessage, setCommitMessage] = useState('');
	const [currentFile, setCurrentFile] = useState<string>('');

	// Determine initial view
	useEffect(() => {
		const hasToken = !!tokenStore.getToken();
		const hasProjects = tokenStore.getRecentProjects().length > 0;
		if (hasToken && hasProjects) {
			setView('landing');
		} else {
			setView('connect');
		}
	}, []);

	const handleFileOpen = useCallback(async (owner: string, repo: string, branch: string, filePath: string) => {
		try {
			const fileInfo = await gitHubSyncService.loadFile(owner, repo, branch, filePath);
			setCurrentFile(filePath);
			setView('editor');
			onFileReady(fileInfo.content, filePath);
		} catch (err) {
			alert(`Failed to load file: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	}, [onFileReady]);

	const handleOpenProject = useCallback(async (owner: string, repo: string, branch: string, lastFile: string | null) => {
		if (lastFile) {
			await handleFileOpen(owner, repo, branch, lastFile);
		} else {
			setView('connect');
		}
	}, [handleFileOpen]);

	const handleSave = useCallback(async () => {
		if (!editorContent) return;
		setCommitPrompt(true);
	}, [editorContent]);

	const handleCommitConfirm = useCallback(async () => {
		if (!editorContent) return;
		setCommitPrompt(false);
		const message = commitMessage.trim() || 'Update ' + currentFile;

		const result = await gitHubSyncService.commitFile(editorContent, message);
		if (!result.success && result.conflict) {
			setConflict(result.conflict);
		}
		setCommitMessage('');
	}, [editorContent, commitMessage, currentFile]);

	const handleOverwrite = useCallback(async (message: string) => {
		if (!conflict || !editorContent) return;
		await gitHubSyncService.forceOverwrite(editorContent, conflict.remoteSha, message);
		setConflict(null);
	}, [conflict, editorContent]);

	const handleReload = useCallback(async () => {
		const content = await gitHubSyncService.reloadFile();
		setConflict(null);
		onFileReady(content, currentFile);
	}, [onFileReady, currentFile]);

	const handleSaveAsNewBranch = useCallback(async (branchName: string, message: string) => {
		if (!editorContent) return;
		await gitHubSyncService.createBranchAndCommit(editorContent, branchName, message);
		setConflict(null);
	}, [editorContent]);

	// Keyboard shortcut: Ctrl+S
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 's') {
				e.preventDefault();
				handleSave();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleSave]);

	const handleBackToProjects = () => {
		gitHubSyncService.disconnect();
		setCurrentFile('');
		setView('landing');
	};

	return (
		<>
			{/* Header bar - always visible */}
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
						title="Help"
					>
						?
					</button>
				</div>
			</header>

			{/* Main content */}
			<main className="abcd-main">
				{view === 'landing' && (
					<RecentProjects
						onOpenProject={handleOpenProject}
						onNewConnection={() => setView('connect')}
					/>
				)}
				{view === 'connect' && (
					<ConnectionPanel onFileOpen={handleFileOpen} />
				)}
			</main>

			{/* Commit message prompt */}
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

			{/* Onboarding tour (first visit only) */}
			{view === 'connect' && <OnboardingTour />}
		</>
	);
};

export default AbcdApp;
