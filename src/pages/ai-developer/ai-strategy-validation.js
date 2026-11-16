// Strict allowlist for the subset the existing XML compiler can faithfully express.
const symbols = ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'JD10', 'JD50', 'JD100'];
const contracts = ['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'CALL', 'PUT'];
const digitContracts = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD'];
const predictionContracts = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];
const keys = ['name', 'symbol', 'contractType', 'barrier', 'recoveryBarrier', 'durationTicks', 'baseStake', 'martingaleMultiplier', 'takeProfit', 'stopLoss', 'entryFilter', 'entryDigit'];
const ruleKeys = ['name', 'when', 'contractType', 'barrier'];
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const number = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const sensitive = text => /\b(?:sk-(?:or-v1-)?[a-zA-Z0-9_-]{16,}|pat_[a-zA-Z0-9_-]+|ory_ac_[a-zA-Z0-9_-]+)\b/i.test(text);
const safeName = name => typeof name === 'string' && /^[a-zA-Z0-9 _-]{1,60}$/.test(name);

// Entry conditions the compiler can express. Returns a reason string or null.
function conditionProblem(condition, depth = 0) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return 'each entry condition must be an object';
    if (typeof condition.type !== 'string') return 'each entry condition needs a type';
    switch (condition.type) {
        case 'ALWAYS':
            return Object.keys(condition).length === 1 ? null : 'ALWAYS takes no other fields';
        case 'PARITY_STREAK':
            return condition.parity === 'EVEN' || condition.parity === 'ODD'
                ? integer(condition.count, 1, 20) ? null : 'PARITY_STREAK count must be an integer from 1 to 20'
                : 'PARITY_STREAK parity must be EVEN or ODD';
        case 'DIGIT_STREAK':
            if (!['LT', 'GT', 'LTE', 'GTE', 'EQ'].includes(condition.op)) return 'DIGIT_STREAK op must be LT, GT, LTE, GTE or EQ';
            if (!integer(condition.barrier, 0, 9)) return 'DIGIT_STREAK barrier must be an integer from 0 to 9';
            return integer(condition.count, 1, 20) ? null : 'DIGIT_STREAK count must be an integer from 1 to 20';
        case 'EXACT_DIGIT':
            return integer(condition.digit, 0, 9) ? null : 'EXACT_DIGIT digit must be an integer from 0 to 9';
        case 'PARITY_SHARE':
            if (condition.parity !== 'EVEN' && condition.parity !== 'ODD') return 'PARITY_SHARE parity must be EVEN or ODD';
            if (!integer(condition.window, 5, 1000)) return 'PARITY_SHARE window must be an integer from 5 to 1000';
            return integer(condition.minPercent, 1, 100) ? null : 'PARITY_SHARE minPercent must be an integer from 1 to 100';
        case 'OVER_UNDER_SHARE':
            if (condition.direction !== 'OVER' && condition.direction !== 'UNDER') return 'OVER_UNDER_SHARE direction must be OVER or UNDER';
            if (!integer(condition.barrier, 0, 9)) return 'OVER_UNDER_SHARE barrier must be an integer from 0 to 9';
            if (!integer(condition.window, 5, 1000)) return 'OVER_UNDER_SHARE window must be an integer from 5 to 1000';
            return integer(condition.minPercent, 1, 100) ? null : 'OVER_UNDER_SHARE minPercent must be an integer from 1 to 100';
        case 'TICK_RUN':
            if (condition.direction !== 'RISE' && condition.direction !== 'FALL') return 'TICK_RUN direction must be RISE or FALL';
            return integer(condition.count, 1, 20) ? null : 'TICK_RUN count must be an integer from 1 to 20';
        case 'ALL':
        case 'ANY': {
            if (depth > 1) return 'nested ALL/ANY groups are limited to two levels';
            if (!Array.isArray(condition.of) || condition.of.length < 2 || condition.of.length > 5)
                return `${condition.type} needs an "of" array of 2 to 5 conditions`;
            if (Object.keys(condition).length !== 2) return `${condition.type} accepts only type and of`;
            for (const child of condition.of) {
                const problem = conditionProblem(child, depth + 1);
                if (problem) return problem;
            }
            return null;
        }
        default:
            return `unsupported entry condition type "${condition.type}"`;
    }
}

function rulesProblem(rules) {
    if (!Array.isArray(rules)) return 'rules must be an array';
    if (rules.length < 1 || rules.length > 12) return 'rules must contain between 1 and 12 rules';
    for (const [index, rule] of rules.entries()) {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return `rule ${index + 1} must be an object`;
        for (const key of Object.keys(rule)) {
            if (!ruleKeys.includes(key)) return `rule ${index + 1} has unexpected key "${key}"`;
        }
        for (const key of ['name', 'when', 'contractType']) {
            if (!(key in rule)) return `rule ${index + 1} is missing "${key}"`;
        }
        if (!safeName(rule.name)) return `rule ${index + 1} name must be 1-60 characters using letters, digits, spaces, underscore or hyphen`;
        const conditionIssue = conditionProblem(rule.when);
        if (conditionIssue) return `rule ${index + 1}: ${conditionIssue}`;
        if (!contracts.includes(rule.contractType)) return `rule ${index + 1} contractType is not supported`;
        if (rule.contractType === 'DIGITOVER' && !integer(rule.barrier, 0, 8)) return `rule ${index + 1} DIGITOVER barrier must be 0 to 8`;
        if (rule.contractType === 'DIGITUNDER' && !integer(rule.barrier, 1, 9)) return `rule ${index + 1} DIGITUNDER barrier must be 1 to 9`;
        if (predictionContracts.includes(rule.contractType) && !integer(rule.barrier, 0, 9)) return `rule ${index + 1} needs a barrier from 0 to 9`;
    }
    return null;
}

// Returns a short, model-facing reason the spec is invalid, or null when valid.
// Used by the server to request one corrected response instead of failing the chat.
function specProblem(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return 'spec must be an object or null';
    for (const k of keys) if (!(k in s)) return `spec is missing required key "${k}"`;
    if (!Object.prototype.hasOwnProperty.call(s, 'virtualHook')) return 'spec is missing required key "virtualHook"';
    for (const k of Object.keys(s)) if (!keys.includes(k) && k !== 'virtualHook' && k !== 'rules') return `spec has unexpected key "${k}"`;
    if (!safeName(s.name)) return 'name must be 1-60 characters using only letters, digits, spaces, underscore or hyphen (no parentheses, punctuation or currency symbols)';
    if (!symbols.includes(s.symbol)) return `symbol must be one of: ${symbols.join(', ')}`;
    if (!contracts.includes(s.contractType)) return 'contractType is not supported';
    if (!integer(s.barrier, 0, 9) || !integer(s.recoveryBarrier, 0, 9)) return 'barrier and recoveryBarrier must be integers from 0 to 9';
    if (!integer(s.durationTicks, 1, 10)) return 'durationTicks must be an integer from 1 to 10';
    if (!number(s.baseStake, 0.35, 10000)) return 'baseStake must be a number from 0.35 to 10000';
    if (!number(s.martingaleMultiplier, 1, 20)) return 'martingaleMultiplier must be a number from 1 to 20';
    if (!number(s.takeProfit, 0.5, 100000)) return 'takeProfit must be a number from 0.5 to 100000';
    if (!number(s.stopLoss, 1, 100000)) return 'stopLoss must be a number from 1 to 100000';
    if (!['INSTANT', 'EXACT_DIGIT'].includes(s.entryFilter)) return 'entryFilter must be INSTANT or EXACT_DIGIT';
    if (!integer(s.entryDigit, 0, 9)) return 'entryDigit must be an integer from 0 to 9 (use the number 0 for INSTANT, never null)';

    if (s.rules !== undefined) {
        const issue = rulesProblem(s.rules);
        if (issue) return issue;
        // With rules, the top-level contract is only the trade-definition header and
        // must match the first rule so the review panel and the buy header cannot disagree.
        if (s.contractType !== s.rules[0].contractType) return 'when rules are used, contractType must equal the first rule contractType';
        if ((s.rules[0].barrier ?? 0) !== s.barrier) return 'when rules are used, barrier must equal the first rule barrier (use 0 for even/odd, rise/fall)';
        if (s.entryFilter !== 'INSTANT' || s.entryDigit !== 0) return 'when rules are used, entryFilter must be INSTANT and entryDigit must be 0';
        if (s.recoveryBarrier !== s.barrier) return 'when rules are used, recoveryBarrier must equal barrier because rule barriers do not change after a loss';
        if (s.rules.every(rule => rule.contractType === 'DIGITEVEN' || rule.contractType === 'DIGITODD')) {
            if (!integer(s.barrier, 0, 9)) return 'barrier must be 0 for even/odd rules';
        }
    } else {
        if (s.contractType === 'DIGITOVER' && (s.barrier > 8 || s.recoveryBarrier > 8)) return 'DIGITOVER barrier and recoveryBarrier must be from 0 to 8';
        if (s.contractType === 'DIGITUNDER' && (s.barrier < 1 || s.recoveryBarrier < 1)) return 'DIGITUNDER barrier and recoveryBarrier must be from 1 to 9';
        // Only the contract types with prediction can change prediction after a loss.
        if (!predictionContracts.includes(s.contractType) && (s.barrier !== 0 || s.recoveryBarrier !== 0)) return 'barrier and recoveryBarrier must be 0 for this contract type';
    }

    if (s.virtualHook !== null) {
        const vh = s.virtualHook;
        if (!vh || typeof vh !== 'object' || Array.isArray(vh)) return 'virtualHook must be null or an object with virtualLosses and virtualWins';
        if (Object.keys(vh).length !== 2 || !('virtualLosses' in vh) || !('virtualWins' in vh)) return 'virtualHook must contain exactly virtualLosses and virtualWins, with no other keys';
        if (!integer(vh.virtualLosses, 1, 10) || !integer(vh.virtualWins, 1, 10)) return 'virtualHook virtualLosses and virtualWins must be integers from 1 to 10';
        if (s.durationTicks !== 1) return 'virtualHook requires a one-tick contract';
        if (s.rules !== undefined) {
            if (!s.rules.every(rule => digitContracts.includes(rule.contractType))) return 'virtualHook requires that every rule buys a digit contract';
        } else if (!digitContracts.includes(s.contractType)) {
            return 'virtualHook requires a one-tick digit contract';
        }
    }
    return null;
}

function answerProblem(answer) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return 'the response must be a JSON object with reply and spec';
    if (Object.keys(answer).length !== 2 || !('reply' in answer) || !('spec' in answer)) return 'the response must contain exactly the keys "reply" and "spec"';
    if (typeof answer.reply !== 'string' || !answer.reply.trim() || answer.reply.length > 2500) return 'reply must be a non-empty string of at most 2500 characters';
    if (sensitive(answer.reply)) return 'reply must not contain credentials';
    if (answer.spec !== null) return specProblem(answer.spec);
    return null;
}

const validateSpec = s => specProblem(s) === null;
const validateAnswer = a => answerProblem(a) === null;

module.exports = { validateSpec, validateAnswer, specProblem, answerProblem, sensitive };
