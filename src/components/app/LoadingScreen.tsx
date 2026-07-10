// src/components/app/LoadingScreen.tsx
import type React from 'react';

import { t } from '@/i18n';
import abcdLogo from '../../assets/images/abcd-logo.jpg';
import texlyreLogo from '../../assets/images/TeXlyre_notext.png';

const LoadingScreen: React.FC = () => {
	return (
		<div className='loading-container'>
			<div className='abcd-loading-logos'>
				<img src={abcdLogo} alt="ABCD" className='abcd-loading-logo' />
				<span className='abcd-loading-plus'>+</span>
				<img src={texlyreLogo} alt="TeXlyre" className='abcd-loading-logo' />
			</div>
			<div className='loading-spinner' />
			<p>{t('Loading ABCD LaTeX...')}</p>
		</div>
	);
};

export default LoadingScreen;
