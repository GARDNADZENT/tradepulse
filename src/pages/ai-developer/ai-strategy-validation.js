// Strict allowlist for the subset the existing XML compiler can faithfully express.
const symbols = ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'JD10', 'JD50', 'JD100'];
const contracts = ['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'CALL', 'PUT'];
const keys = ['name', 'symbol', 'contractType', 'barrier', 'recoveryBarrier', 'durationTicks', 'baseStake', 'martingaleMultiplier', 'takeProfit', 'stopLoss', 'entryFilter', 'entryDigit'];
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const number = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const sensitive = text => /\b(?:sk-(?:or-v1-)?[a-zA-Z0-9_-]{16,}|pat_[a-zA-Z0-9_-]+|ory_ac_[a-zA-Z0-9_-]+)\b/i.test(text);

function validateSpec(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).length !== keys.length || keys.some(k => !(k in s)) || Object.keys(s).some(k => !keys.includes(k))) return false;
    if (typeof s.name !== 'string' || !/^[a-zA-Z0-9 _-]{1,60}$/.test(s.name) || !symbols.includes(s.symbol) || !contracts.includes(s.contractType)) return false;
    if (!integer(s.barrier, 0, 9) || !integer(s.recoveryBarrier, 0, 9) || !integer(s.durationTicks, 1, 10)) return false;
    if (s.contractType === 'DIGITOVER' && (s.barrier > 8 || s.recoveryBarrier > 8)) return false;
    if (s.contractType === 'DIGITUNDER' && (s.barrier < 1 || s.recoveryBarrier < 1)) return false;
    if (!number(s.baseStake, 0.35, 10000) || !number(s.martingaleMultiplier, 1, 20) || !number(s.takeProfit, 0.5, 100000) || !number(s.stopLoss, 1, 100000)) return false;
    if (!['INSTANT', 'EXACT_DIGIT'].includes(s.entryFilter) || !integer(s.entryDigit, 0, 9)) return false;
    // Only the contract types with prediction can change prediction after a loss.
    if (!['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(s.contractType) && (s.barrier !== 0 || s.recoveryBarrier !== 0)) return false;
    return true;
}

function validateAnswer(answer) {
    return !!answer && typeof answer === 'object' && !Array.isArray(answer) &&
        Object.keys(answer).length === 2 && typeof answer.reply === 'string' &&
        answer.reply.trim().length > 0 && answer.reply.length <= 2500 && !sensitive(answer.reply) &&
        (answer.spec === null || validateSpec(answer.spec));
}

module.exports = { validateSpec, validateAnswer, sensitive };
