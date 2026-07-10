// src/components/github/SaveStatus.tsx
import type React from 'react';
import { useState, useEffect } from 'react';
import { gitHubSyncService, type SaveStatus as SaveStatusType } from '../../services/GitHubSyncService';

interface SaveStatusProps {
	onSave: () => void;
}

const SaveStatusIndicator: React.FC<SaveStatusProps> = ({ onSave }) => {
	const [status, setStatus] = useState<SaveStatusType>(gitHubSyncService.getStatus());

	useEffect(() => {
		return gitHubSyncService.addStatusListener(setStatus);
	}, []);

	const getStatusDisplay = () => {
		switch (status) {
			case 'idle':
				return { icon: '✓', text: 'Up to date', className: 'abcd-status-idle' };
			case 'unsaved':
				return { icon: '●', text: 'Unsaved changes', className: 'abcd-status-unsaved' };
			case 'saving':
				return { icon: '↻', text: 'Saving...', className: 'abcd-status-saving' };
			case 'saved':
				return { icon: '✓', text: 'Saved', className: 'abcd-status-saved' };
			case 'conflict':
				return { icon: '⚠', text: 'Conflict', className: 'abcd-status-conflict' };
			case 'error':
				return { icon: '✕', text: 'Save failed', className: 'abcd-status-error' };
		}
	};

	const display = getStatusDisplay();

	return (
		<div className={`abcd-save-status ${display.className}`}>
			<span className="abcd-save-status-icon">{display.icon}</span>
			<span className="abcd-save-status-text">{display.text}</span>
			{status === 'unsaved' && (
				<button
					type="button"
					className="abcd-btn-save"
					onClick={onSave}
					title="Save to GitHub (Ctrl+S)"
				>
					Save
				</button>
			)}
		</div>
	);
};

export default SaveStatusIndicator;
