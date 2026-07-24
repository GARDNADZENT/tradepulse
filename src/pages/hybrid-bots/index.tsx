import React from 'react';
import Text from '@/components/shared_ui/text';
import { Localize } from '@deriv-com/translations';

const HybridBots: React.FC = () => (
    <div style={{ padding: '40px', textAlign: 'center' }}>
        <Text size='m' color='general'>
            <Localize i18n_default_text='SpeedBots coming soon.' />
        </Text>
    </div>
);

export default HybridBots;
