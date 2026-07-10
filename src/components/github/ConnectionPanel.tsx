// src/components/github/ConnectionPanel.tsx
import type React from 'react';
import { useState, useEffect } from 'react';
import { tokenStore } from '../../services/TokenStore';
import { gitHubSyncService, type FileListItem } from '../../services/GitHubSyncService';

interface ConnectionPanelProps {
	onFileOpen: (owner: string, repo: string, branch: string, filePath: string) => void;
}

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ onFileOpen }) => {
	const [token, setToken] = useState(tokenStore.getToken() || '');
	const [repoInput, setRepoInput] = useState('');
	const [branch, setBranch] = useState('main');
	const [branches, setBranches] = useState<string[]>([]);
	const [files, setFiles] = useState<FileListItem[]>([]);
	const [currentPath, setCurrentPath] = useState('');
	const [isConnecting, setIsConnecting] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [userInfo, setUserInfo] = useState<{ login: string; avatar_url: string } | null>(null);

	useEffect(() => {
		const savedToken = tokenStore.getToken();
		if (savedToken) setToken(savedToken);
	}, []);

	const parseRepoInput = (input: string): { owner: string; repo: string } | null => {
		const trimmed = input.trim();
		// https://github.com/owner/repo.git or https://github.com/owner/repo
		const httpsMatch = trimmed.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?\/?$/);
		if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
		// git@github.com:owner/repo.git
		const sshMatch = trimmed.match(/git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/);
		if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
		// Plain owner/repo
		const parts = trimmed.split('/');
		if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
			return { owner: parts[0], repo: parts[1] };
		}
		return null;
	};

	const handleConnect = async () => {
		if (!token.trim() || !repoInput.trim()) {
			setError('Please enter both a token and repository.');
			return;
		}

		const parsed = parseRepoInput(repoInput);
		if (!parsed) {
			setError('Enter owner/repo, a GitHub URL, or a clone URL (https://github.com/owner/repo.git)');
			return;
		}

		setIsConnecting(true);
		setError(null);
		tokenStore.setToken(token.trim());

		try {
			const user = await gitHubSyncService.testConnection();
			setUserInfo(user);

			const { owner, repo } = parsed;
			const branchList = await gitHubSyncService.listBranches(owner, repo);
			setBranches(branchList);

			// Use the current branch if it exists, otherwise pick the first available
			const resolvedBranch = branchList.includes(branch) ? branch : (branchList[0] || 'main');
			setBranch(resolvedBranch);

			const fileList = await gitHubSyncService.listFiles(owner, repo, resolvedBranch);
			setFiles(fileList);
			setIsConnected(true);
			setCurrentPath('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Connection failed');
			setIsConnected(false);
		} finally {
			setIsConnecting(false);
		}
	};

	const handleBranchChange = async (newBranch: string) => {
		setBranch(newBranch);
		const parsed = parseRepoInput(repoInput);
		if (!parsed) return;
		const { owner, repo } = parsed;
		try {
			const fileList = await gitHubSyncService.listFiles(owner, repo, newBranch);
			setFiles(fileList);
			setCurrentPath('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to list files');
		}
	};

	const handleNavigate = async (item: FileListItem) => {
		const parsed = parseRepoInput(repoInput);
		if (!parsed) return;
		const { owner, repo } = parsed;
		if (item.type === 'dir') {
			try {
				const fileList = await gitHubSyncService.listFiles(owner, repo, branch, item.path);
				setFiles(fileList);
				setCurrentPath(item.path);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to navigate');
			}
		} else {
			onFileOpen(owner, repo, branch, item.path);
		}
	};

	const handleNavigateUp = async () => {
		const parsed = parseRepoInput(repoInput);
		if (!parsed) return;
		const { owner, repo } = parsed;
		const parentPath = currentPath.split('/').slice(0, -1).join('/');
		try {
			const fileList = await gitHubSyncService.listFiles(owner, repo, branch, parentPath);
			setFiles(fileList);
			setCurrentPath(parentPath);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to navigate');
		}
	};

	const handleForgetToken = () => {
		tokenStore.clearToken();
		setToken('');
		setIsConnected(false);
		setUserInfo(null);
		setFiles([]);
	};

	return (
		<div className="abcd-connection-panel">
			<div className="abcd-connection-form">
				<h3>Connect to GitHub Repository</h3>

				<div className="abcd-field">
					<label htmlFor="pat-input">
						GitHub Fine-Grained Personal Access Token
					</label>
					<div className="abcd-token-row">
						<input
							id="pat-input"
							type="password"
							value={token}
							onChange={(e) => setToken(e.target.value)}
							placeholder="github_pat_..."
							disabled={isConnected}
						/>
						{token && (
							<button
								type="button"
								className="abcd-btn-small abcd-btn-danger"
								onClick={handleForgetToken}
								title="Remove stored token"
							>
								Forget Token
							</button>
						)}
					</div>
					<small className="abcd-security-notice">
						⚠️ This token is stored unencrypted in your browser's localStorage.
						Use a scoped, revocable fine-grained PAT with only "Contents: Read and write" permission.
						It is only as safe as this device.
					</small>
				</div>

				<div className="abcd-field">
					<label htmlFor="repo-input">Repository</label>
					<input
						id="repo-input"
						type="text"
						value={repoInput}
						onChange={(e) => setRepoInput(e.target.value)}
						placeholder="owner/repo or https://github.com/owner/repo.git"
						disabled={isConnected}
					/>
				</div>

				{!isConnected ? (
					<button
						type="button"
						className="abcd-btn-primary"
						onClick={handleConnect}
						disabled={isConnecting}
					>
						{isConnecting ? 'Connecting...' : 'Connect'}
					</button>
				) : (
					<button
						type="button"
						className="abcd-btn-secondary"
						onClick={() => { setIsConnected(false); setFiles([]); }}
					>
						Disconnect
					</button>
				)}

				{userInfo && (
					<div className="abcd-user-info">
						<img src={userInfo.avatar_url} alt="" width={24} height={24} />
						<span>Connected as <strong>{userInfo.login}</strong></span>
					</div>
				)}

				{error && <div className="abcd-error">{error}</div>}
			</div>

			{isConnected && (
				<div className="abcd-file-browser">
					<div className="abcd-branch-selector">
						<label htmlFor="branch-select">Branch:</label>
						<select
							id="branch-select"
							value={branch}
							onChange={(e) => handleBranchChange(e.target.value)}
						>
							{branches.map((b) => (
								<option key={b} value={b}>{b}</option>
							))}
						</select>
					</div>

					<div className="abcd-file-list">
						<div className="abcd-path-breadcrumb">
							📁 /{currentPath || ''}
						</div>
						{currentPath && (
							<button
								type="button"
								className="abcd-file-item abcd-file-item-up"
								onClick={handleNavigateUp}
							>
								⬆️ ..
							</button>
						)}
						{files.map((item) => (
							<button
								type="button"
								key={item.path}
								className={`abcd-file-item ${item.type === 'dir' ? 'abcd-file-dir' : 'abcd-file-file'}`}
								onClick={() => handleNavigate(item)}
							>
								{item.type === 'dir' ? '📁' : '📄'} {item.name}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

export default ConnectionPanel;
