// src/components/github/HelpPage.tsx
import type React from 'react';
import { tokenStore } from '../../services/TokenStore';

interface HelpPageProps {
	onClose: () => void;
}

const HelpPage: React.FC<HelpPageProps> = ({ onClose }) => {
	const handleResetTour = () => {
		tokenStore.resetTourSeen();
		onClose();
		window.location.reload();
	};

	return (
		<div className="abcd-help-overlay">
			<div className="abcd-help-page">
				<div className="abcd-help-header">
					<h2>How ABCD LaTeX Works</h2>
					<button type="button" className="abcd-btn-close" onClick={onClose}>✕</button>
				</div>
				<div className="abcd-help-content">
					<section>
						<h3>1. Create a GitHub Fine-Grained Personal Access Token</h3>
						<ol>
							<li>Go to <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer">GitHub → Settings → Developer Settings → Fine-grained tokens</a></li>
							<li>Click <strong>"Generate new token"</strong></li>
							<li>Give it a name (e.g., "ABCD LaTeX")</li>
							<li>Set an expiration (e.g., 90 days)</li>
							<li>Under <strong>Repository access</strong>, select "Only select repositories" and pick your LaTeX repo</li>
							<li>Under <strong>Permissions → Repository permissions</strong>, set <strong>"Contents"</strong> to <strong>"Read and write"</strong></li>
							<li>Click "Generate token" and copy it</li>
						</ol>
						<p className="abcd-help-note">
							⚠️ Use a fine-grained token scoped to only the repos you need. 
							Never use a classic token with broad permissions.
						</p>
					</section>

					<section>
						<h3>2. Connect a Repository</h3>
						<p>
							Paste your token on the connection screen, enter your repository in 
							<code>owner/repo</code> format, pick a branch, and browse files.
							Click any <code>.tex</code> file to open it in the editor.
						</p>
					</section>

					<section>
						<h3>3. Autosave & Commit Behavior</h3>
						<ul>
							<li><strong>Local drafts:</strong> Your work is saved locally (IndexedDB) every 2 seconds of inactivity, protecting against crashes.</li>
							<li><strong>Manual save (Ctrl+S):</strong> Commits immediately to GitHub. You'll be prompted for a commit message.</li>
							<li><strong>Auto-commit:</strong> After 5 minutes of inactivity following an edit, an automatic commit is made with a timestamp message. Configure this timeout in settings.</li>
						</ul>
					</section>

					<section>
						<h3>4. Conflict Warnings</h3>
						<p>
							Before every commit, the app checks if the file was changed on GitHub 
							since you loaded it. If it was (e.g., a teammate committed), you'll see 
							a conflict dialog with three choices:
						</p>
						<ul>
							<li><strong>Overwrite:</strong> Replace the remote version with yours</li>
							<li><strong>Reload:</strong> Discard your local changes and load the remote version</li>
							<li><strong>Save as new branch:</strong> Keep both — your version goes to a new branch</li>
						</ul>
					</section>

					<section>
						<h3>5. Recent Projects</h3>
						<p>
							Every repo/branch you connect to is remembered. On the landing page,
							click any recent project to reopen it instantly. The list shows the 
							last file you had open.
						</p>
					</section>

					<section>
						<h3>6. Token Security & "Forget Token"</h3>
						<p>
							Your token is stored in the browser's localStorage — unencrypted, 
							but never sent anywhere except directly to <code>api.github.com</code>.
							Click <strong>"Forget Token"</strong> on the connection screen to remove it entirely.
						</p>
					</section>

					<section>
						<h3>7. Comments</h3>
						<p>
							Comments are stored as inline markup in your LaTeX source code.
							They are committed alongside the file, so your team sees them 
							when they pull the latest version.
						</p>
					</section>

					<div className="abcd-help-footer">
						<button type="button" className="abcd-btn-secondary" onClick={handleResetTour}>
							Show onboarding tour again
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default HelpPage;
