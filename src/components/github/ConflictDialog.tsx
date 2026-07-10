// src/components/github/ConflictDialog.tsx
import type React from 'react';
import { useState } from 'react';
import type { ConflictInfo } from '../../services/GitHubSyncService';

interface ConflictDialogProps {
	conflict: ConflictInfo;
	onOverwrite: (message: string) => void;
	onReload: () => void;
	onSaveAsNewBranch: (branchName: string, message: string) => void;
	onCancel: () => void;
}

const ConflictDialog: React.FC<ConflictDialogProps> = ({
	conflict,
	onOverwrite,
	onReload,
	onSaveAsNewBranch,
	onCancel,
}) => {
	const [choice, setChoice] = useState<'overwrite' | 'reload' | 'branch' | null>(null);
	const [branchName, setBranchName] = useState(`conflict-${Date.now()}`);
	const [commitMessage, setCommitMessage] = useState('Resolve conflict: overwrite remote');

	const handleConfirm = () => {
		switch (choice) {
			case 'overwrite':
				onOverwrite(commitMessage);
				break;
			case 'reload':
				onReload();
				break;
			case 'branch':
				onSaveAsNewBranch(branchName, commitMessage);
				break;
		}
	};

	return (
		<div className="abcd-conflict-overlay">
			<div className="abcd-conflict-dialog">
				<h3>⚠️ Conflict Detected</h3>
				<p>
					The file <strong>{conflict.filePath}</strong> has been modified on GitHub
					since you loaded it. Someone else (or another session) committed changes.
				</p>

				<div className="abcd-conflict-diff">
					<div className="abcd-conflict-pane">
						<h4>Your version (local)</h4>
						<pre>{conflict.localContent.slice(0, 500)}{conflict.localContent.length > 500 ? '...' : ''}</pre>
					</div>
					<div className="abcd-conflict-pane">
						<h4>Remote version (GitHub)</h4>
						<pre>{conflict.remoteContent.slice(0, 500)}{conflict.remoteContent.length > 500 ? '...' : ''}</pre>
					</div>
				</div>

				<div className="abcd-conflict-choices">
					<label className="abcd-conflict-choice">
						<input
							type="radio"
							name="conflict-choice"
							checked={choice === 'overwrite'}
							onChange={() => setChoice('overwrite')}
						/>
						<strong>Overwrite</strong> — Replace remote with your local version
					</label>
					<label className="abcd-conflict-choice">
						<input
							type="radio"
							name="conflict-choice"
							checked={choice === 'reload'}
							onChange={() => setChoice('reload')}
						/>
						<strong>Reload</strong> — Discard your local changes, load remote version
					</label>
					<label className="abcd-conflict-choice">
						<input
							type="radio"
							name="conflict-choice"
							checked={choice === 'branch'}
							onChange={() => setChoice('branch')}
						/>
						<strong>Save as new branch</strong> — Keep both, commit yours to a new branch
					</label>
				</div>

				{choice === 'branch' && (
					<div className="abcd-field">
						<label htmlFor="branch-name-input">New branch name:</label>
						<input
							id="branch-name-input"
							type="text"
							value={branchName}
							onChange={(e) => setBranchName(e.target.value)}
						/>
					</div>
				)}

				{(choice === 'overwrite' || choice === 'branch') && (
					<div className="abcd-field">
						<label htmlFor="conflict-message-input">Commit message:</label>
						<input
							id="conflict-message-input"
							type="text"
							value={commitMessage}
							onChange={(e) => setCommitMessage(e.target.value)}
						/>
					</div>
				)}

				<div className="abcd-conflict-actions">
					<button
						type="button"
						className="abcd-btn-primary"
						onClick={handleConfirm}
						disabled={!choice}
					>
						Confirm
					</button>
					<button
						type="button"
						className="abcd-btn-secondary"
						onClick={onCancel}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

export default ConflictDialog;
