// src/components/github/OnboardingTour.tsx
import type React from 'react';
import { useState, useEffect } from 'react';
import { tokenStore } from '../../services/TokenStore';

interface TourStep {
	target: string;
	title: string;
	content: string;
	position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
	{
		target: '#pat-input',
		title: '1. Paste your GitHub PAT',
		content: 'Enter a fine-grained Personal Access Token with "Contents: Read and write" permission for your LaTeX repository.',
		position: 'bottom',
	},
	{
		target: '#repo-input',
		title: '2. Enter your repository',
		content: 'Type the repository in owner/repo format (e.g., andylegear/my-paper) and click Connect.',
		position: 'bottom',
	},
	{
		target: '.abcd-editor-area',
		title: '3. Editor & PDF Preview',
		content: 'Write LaTeX on the left, see the compiled PDF preview on the right. Compilation happens entirely in your browser.',
		position: 'top',
	},
	{
		target: '.abcd-save-status',
		title: '4. Autosave & Manual Save',
		content: 'Local drafts are saved automatically. Press Ctrl+S or click Save to commit to GitHub. The status indicator shows your save state.',
		position: 'bottom',
	},
	{
		target: '.abcd-help-btn',
		title: '5. Help & Comments',
		content: 'Click the Help icon anytime for documentation. Comments in your LaTeX files are stored inline and committed with the file.',
		position: 'left',
	},
];

const OnboardingTour: React.FC = () => {
	const [currentStep, setCurrentStep] = useState(0);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (!tokenStore.isTourSeen()) {
			// Small delay to let the UI render
			const timer = setTimeout(() => setIsVisible(true), 1500);
			return () => clearTimeout(timer);
		}
	}, []);

	if (!isVisible) return null;

	const step = TOUR_STEPS[currentStep];

	const handleNext = () => {
		if (currentStep < TOUR_STEPS.length - 1) {
			setCurrentStep(currentStep + 1);
		} else {
			handleDismiss();
		}
	};

	const handleDismiss = () => {
		tokenStore.setTourSeen();
		setIsVisible(false);
	};

	return (
		<div className="abcd-tour-overlay">
			<div className="abcd-tour-backdrop" onClick={handleDismiss} onKeyDown={() => {}} role="presentation" />
			<div className={`abcd-tour-tooltip abcd-tour-${step.position}`}>
				<div className="abcd-tour-header">
					<span className="abcd-tour-step-count">
						{currentStep + 1} / {TOUR_STEPS.length}
					</span>
					<button type="button" className="abcd-tour-dismiss" onClick={handleDismiss}>
						✕
					</button>
				</div>
				<h4>{step.title}</h4>
				<p>{step.content}</p>
				<div className="abcd-tour-actions">
					{currentStep > 0 && (
						<button
							type="button"
							className="abcd-btn-secondary"
							onClick={() => setCurrentStep(currentStep - 1)}
						>
							Back
						</button>
					)}
					<button type="button" className="abcd-btn-primary" onClick={handleNext}>
						{currentStep < TOUR_STEPS.length - 1 ? 'Next' : 'Finish'}
					</button>
				</div>
			</div>
		</div>
	);
};

export default OnboardingTour;
