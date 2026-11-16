// Strict allowlist for the subset the existing XML compiler can faithfully express.
const symbols = ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'JD10', 'JD50', 'JD100'];
const contracts = ['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'CALL', 'PUT'];
const digitContracts = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD'];
const predictionContracts = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];
const keys = ['name', 'symbol', 'contractType', 'barrier', 'recoveryBarrier', 'durationTicks', 'baseStake', 'martingaleMultiplier', 'takeProfit', 'stopLoss', 'entryFilter', 'entryDigit'];
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const number = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const sensitive = text => /\b(?:sk-(?:or-v1-)?[a-zA-Z0-9_-]{16,}|pat_[a-zA-Z0-9_-]+|ory_ac_[a-zA-Z0-9_-]+)\b/i.test(text);

// Returns a short, model-facing reason the spec is invalid, or null when valid.
// Used by the server to request one corrected response instead of failing the chat.
function specProblem(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return 'spec must be an object or null';
    for (const k of keys) if (!(k in s)) return `spec is missing required key "${k}"`;
    if (!Object.prototype.hasOwnProperty.call(s, 'virtualHook')) return 'spec is missing required key "virtualHook"';
    for (const k of Object.keys(s)) if (!keys.includes(k) && k !== 'virtualHook') return `spec has unexpected key "${k}"`;
    if (typeof s.name !== 'string' || !/^[a-zA-Z0-9 _-]{1,60}$/.test(s.name)) return 'name must be 1-60 characters using only letters, digits, spaces, underscore or hyphen (no parentheses, punctuation or currency symbols)';
    if (!symbols.includes(s.symbol)) return `symbol must be one of: ${symbols.join(', ')}`;
    if (!contracts.includes(s.contractType)) return 'contractType is not supported';
    if (!integer(s.barrier, 0, 9) || !integer(s.recoveryBarrier, 0, 9)) return 'barrier and recoveryBarrier must be integers from 0 to 9';
    if (s.contractType === 'DIGITOVER' && (s.barrier > 8 || s.recoveryBarrier > 8)) return 'DIGITOVER barrier and recoveryBarrier must be from 0 to 8';
    if (s.contractType === 'DIGITUNDER' && (s.barrier < 1 || s.recoveryBarrier < 1)) return 'DIGITUNDER barrier and recoveryBarrier must be from 1 to 9';
    if (!integer(s.durationTicks, 1, 10)) return 'durationTicks must be an integer from 1 to 10';
    if (!number(s.baseStake, 0.35, 10000)) return 'baseStake must be a number from 0.35 to 10000';
    if (!number(s.martingaleMultiplier, 1, 20)) return 'martingaleMultiplier must be a number from 1 to 20';
    if (!number(s.takeProfit, 0.5, 100000)) return 'takeProfit must be a number from 0.5 to 100000';
    if (!number(s.stopLoss, 1, 100000)) return 'stopLoss must be a number from 1 to 100000';
    if (!['INSTANT', 'EXACT_DIGIT'].includes(s.entryFilter)) return 'entryFilter must be INSTANT or EXACT_DIGIT';
    if (!integer(s.entryDigit, 0, 9)) return 'entryDigit must be an integer from 0 to 9 (use the number 0 for INSTANT, never null)';
    if (s.virtualHook !== null) {
        const vh = s.virtualHook;
        if (!vh || typeof vh !== 'object' || Array.isArray(vh)) return 'virtualHook must be null or an object with virtualLosses and virtualWins';
        if (Object.keys(vh).length !== 2 || !('virtualLosses' in vh) || !('virtualWins' in vh)) return 'virtualHook must contain exactly virtualLosses and virtualWins, with no other keys';
        if (!integer(vh.virtualLosses, 1, 10) || !integer(vh.virtualWins, 1, 10)) return 'virtualHook virtualLosses and virtualWins must be integers from 1 to 10';
        if (!digitContracts.includes(s.contractType) || s.durationTicks !== 1) return 'virtualHook requires a one-tick digit contract';
    }
    // Only the contract types with prediction can change prediction after a loss.
    if (!predictionContracts.includes(s.contractType) && (s.barrier !== 0 || s.recoveryBarrier !== 0)) return 'barrier and recoveryBarrier must be 0 for this contract type';
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
