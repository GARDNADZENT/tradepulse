import type { AIBotContractKind, AIEntryCondition, AIEntryRule } from '@/utils/ai-bot-xml-builder';

const CONTRACT_LABELS: Record<AIBotContractKind, string> = {
    DIGITOVER: 'Over',
    DIGITUNDER: 'Under',
    DIGITEVEN: 'Even',
    DIGITODD: 'Odd',
    DIGITMATCH: 'Matches',
    DIGITDIFF: 'Differs',
    CALL: 'Rise',
    PUT: 'Fall',
};

const PREDICTION_CONTRACTS: AIBotContractKind[] = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];

const OP_LABELS: Record<string, string> = {
    LT: 'below',
    GT: 'above',
    LTE: 'at or below',
    GTE: 'at or above',
    EQ: 'equal to',
};

/** Human-readable condition text used by the AI review panel. */
export const describeEntryCondition = (condition: AIEntryCondition): string => {
    switch (condition.type) {
        case 'ALWAYS':
            return 'every tick';
        case 'PARITY_STREAK':
            return `last ${condition.count} digits all ${condition.parity.toLowerCase()}`;
        case 'DIGIT_STREAK':
            return `last ${condition.count} digits all ${OP_LABELS[condition.op] || 'equal to'} ${condition.barrier}`;
        case 'EXACT_DIGIT':
            return `latest digit is ${condition.digit}`;
        case 'PARITY_SHARE':
            return `${condition.parity.toLowerCase()} is at least ${condition.minPercent}% of the last ${condition.window} digits`;
        case 'OVER_UNDER_SHARE':
            return `at least ${condition.minPercent}% of the last ${condition.window} digits are ${
                condition.direction === 'OVER' ? 'over' : 'under'
            } ${condition.barrier}`;
        case 'TICK_RUN':
            return `last ${condition.count} ticks are ${condition.direction === 'RISE' ? 'rising' : 'falling'}`;
        case 'ALL':
            return condition.of.map(describeEntryCondition).join(' and ');
        case 'ANY':
            return condition.of.map(describeEntryCondition).join(' or ');
        default:
            return 'unsupported condition';
    }
};

export const describeEntryRule = (rule: AIEntryRule): string => {
    const contract = `${CONTRACT_LABELS[rule.contractType] || rule.contractType}${
        PREDICTION_CONTRACTS.includes(rule.contractType) ? ` ${rule.barrier ?? 0}` : ''
    }`;
    return `${rule.name}: ${describeEntryCondition(rule.when)} → buy ${contract}`;
};
