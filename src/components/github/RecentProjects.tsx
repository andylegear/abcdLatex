// src/components/github/RecentProjects.tsx
import type React from 'react';
import { tokenStore, type RecentProject } from '../../services/TokenStore';

interface RecentProjectsProps {
	onOpenProject: (owner: string, repo: string, branch: string, lastFile: string | null) => void;
	onNewConnection: () => void;
}

const RecentProjects: React.FC<RecentProjectsProps> = ({ onOpenProject, onNewConnection }) => {
	const projects = tokenStore.getRecentProjects();

	const formatDate = (timestamp: number): string => {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffHours / 24);

		if (diffHours < 1) return 'Just now';
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	};

	const handleRemove = (e: React.MouseEvent, project: RecentProject) => {
		e.stopPropagation();
		tokenStore.removeRecentProject(project.owner, project.repo, project.branch);
		// Force re-render by triggering parent state — simplistic approach
		window.location.reload();
	};

	if (projects.length === 0) {
		return (
			<div className="abcd-recent-empty">
				<h3>No Recent Projects</h3>
				<p>Connect to a GitHub repository to get started.</p>
				<button type="button" className="abcd-btn-primary" onClick={onNewConnection}>
					Connect Repository
				</button>
			</div>
		);
	}

	return (
		<div className="abcd-recent-projects">
			<div className="abcd-recent-header">
				<h3>Recent Projects</h3>
				<button type="button" className="abcd-btn-secondary" onClick={onNewConnection}>
					+ New Connection
				</button>
			</div>
			<div className="abcd-recent-list">
				{projects.map((project) => (
					<div
						key={`${project.owner}/${project.repo}@${project.branch}`}
						className="abcd-recent-item"
					>
						<button
							type="button"
							className="abcd-recent-item-content"
							onClick={() => onOpenProject(project.owner, project.repo, project.branch, project.lastFile)}
						>
						<div className="abcd-recent-item-main">
							<span className="abcd-recent-item-repo">
								{project.owner}/{project.repo}
							</span>
							<span className="abcd-recent-item-branch">
								🔀 {project.branch}
							</span>
						</div>
						<div className="abcd-recent-item-meta">
							{project.lastFile && (
								<span className="abcd-recent-item-file">
									📄 {project.lastFile}
								</span>
							)}
							<span className="abcd-recent-item-time">
								{formatDate(project.lastOpened)}
							</span>
						</div>
						</button>
						<button
							type="button"
							className="abcd-recent-remove"
							onClick={(e) => handleRemove(e, project)}
							title="Remove from recent"
						>
							✕
						</button>
					</div>
				))}
			</div>
		</div>
	);
};

export default RecentProjects;
