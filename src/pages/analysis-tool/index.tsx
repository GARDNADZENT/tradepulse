import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { ANALYSIS_TOOL_URL } from '@/constants/analysis-tool';
import './analysis-tool.scss';

const AnalysisTool = observer(() => {
    return (
        <div className='analysis-tool'>
            <div className='analysis-tool__iframe-container'>
                <IframeWrapper src={ANALYSIS_TOOL_URL} title='Analysis Tool' />
            </div>
        </div>
    );
});

export default AnalysisTool;
