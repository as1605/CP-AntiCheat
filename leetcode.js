import fs from "fs";
import * as cliProgress from "cli-progress";
import colors from "ansi-colors";
import { glob } from "glob";

const CONTEST_NAME = process.argv[2];

const DIR = "data/leetcode/" + CONTEST_NAME;
fs.mkdirSync(DIR, { recursive: true });
const DIR_SUBMISSIONS = DIR + "/submissions";
fs.mkdirSync(DIR_SUBMISSIONS, { recursive: true });
const DIR_CODES = DIR + "/codes";
fs.mkdirSync(DIR_CODES, { recursive: true });

const BASE_URL = "https://leetcode.com/contest/api/ranking/" + CONTEST_NAME;
const headers = {
    "Referer": "https://leetcode.com/contest/" + CONTEST_NAME + "/ranking/",
    "Referrer-Policy": "strict-origin-when-cross-origin"
}

const fetchQuestions = async (retry = true) => {
    const path = DIR + "/questions.json";
    if (fs.existsSync(path)) {
        return JSON.parse(fs.readFileSync(path));
    }
    const res = (await fetch(BASE_URL + "/?pagination=1&region=global", { headers }));
    if (res.status !== 200) {
        if (retry) {
            console.info("\n ## Retrying getting questions");
            return fetchQuestions(false);
        }
        console.error("\n--- Failed to fetch questions");
        return [];
    }
    const data = await res.json();
    fs.writeFileSync(path, JSON.stringify(data.questions, null, 2));
    return data.questions;
}

const fetchPage = async (page, minSolved = 4, retry = true) => {
    const path = DIR_SUBMISSIONS + "/" + page + ".json";
    if (fs.existsSync(path)) {
        return JSON.parse(fs.readFileSync(path));
    }

    const res = (await fetch(BASE_URL + "/?pagination=" + page + "&region=global", { headers }));
    if (res.status !== 200) {
        if (retry) {
            console.info("\n ## Retrying page", page);
            return fetchPage(page, minSolved, false);
        }
        console.error("\n--- Failed to fetch page", page, res.statusText);
        return [];
    }
    const data = await res.json();
    const submissions = [];
    for (let i = 0; i < data.submissions.length; i++) {
        const questions = Object.values(data.submissions[i]);
        if (questions.length < minSolved) continue;

        submissions.push({ user: data.total_rank[i].user_slug, questions });
    }

    fs.writeFileSync(path, JSON.stringify(submissions, null, 2));
    return submissions;
}

const getPageLimit = async () => {
    let low = 0;
    let high = 1;
    while ((await fetchPage(high)).length > 0) {
        low = high;
        high *= 2;
    }
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((await fetchPage(high)).length > 0) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    return high;
}

const report = async (submissionId, description) => {
    const res = (await fetch("https://leetcode.com/contest/api/reports/", {
        method: "POST",
        body: JSON.stringify({
            contestTitleSlug: CONTEST_NAME,
            submission: submissionId,
            description: description
        }),
        headers: {
            "Content-Type": "application/json",
            ...headers
        }
    }));
    return json.submissions;
}

const fetchAllPages = async (pageLimit = 100, chunk = 1) => {
    const submissions = [];

    const bar = new cliProgress.SingleBar({
        format: 'Fetching pages... |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Pages || Duration: {duration_formatted}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);
    bar.start(pageLimit, 0);

    const promises = [];
    for (let i = 1; i <= pageLimit; i++) {
        promises.push(fetchPage(i).then(page => submissions.push(...page)).finally(() => bar.increment()));
        if (i % chunk === 0) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }

    bar.stop();
    return submissions;
}

const fetchSubmission = async (submissionId, user, root = DIR_CODES, region = "US", retry = true) => {
    const file = user + ":" + submissionId;

    const cache = glob.sync(root + '/*/' + file + ".*");
    if (cache.length > 0) {
        return fs.readFileSync(cache[0], "utf-8");
    }

    const domain = region === "CN" ? "leetcode.cn" : "leetcode.com";
    const res = (await fetch(`https://${domain}/api/submissions/${submissionId}`, { headers }));
    if (res.status !== 200) {
        if (retry) {
            console.info("\n ## Retrying submission", submissionId);
            return fetchSubmission(submissionId, user, root, region, false);
        }
        console.error("\n--- Failed to fetch submission", submissionId);
        return "";
    }
    const data = await res.json();
    const ext = data.lang === "python3" ? "py" : data.lang === "javascript" ? "js" : data.lang;
    const dir = root + '/' + ext + '/';
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dir + file + "." + ext, data.code, "utf-8");
    return data.code;
}

const fetchAllSubmissions = async (submissions, question_id, chunk = 10, ignoreCN = true) => {
    const codes = [];
    const attempts = submissions.map(({ user, questions }) => (
        {
            user,
            question: questions.find(q => q.question_id = question_id && (!ignoreCN || q.data_region !== "CN"))
        })
    ).filter(({ question }) => question);

    const bar = new cliProgress.SingleBar({
        format: 'Fetching submissions... |' + colors.green('{bar}') + '| {percentage}% || {value}/{total} Codes || Duration: {duration_formatted}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);
    bar.start(attempts.length, 0);

    const DIR_QUESTION = DIR_CODES + '/' + question_id;
    fs.mkdirSync(DIR_QUESTION, { recursive: true });

    const promises = [];
    for (let i = 0; i < attempts.length; i++) {
        const { user, question } = attempts[i];
        promises.push(fetchSubmission(
            question.submission_id,
            user,
            DIR_QUESTION,
            question.data_region
        ).then(code => codes.push(code)).finally(() => bar.increment()));
        if (i % chunk === 0) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }

    bar.stop();
    return codes;
}

const run = async () => {
    console.info(":::::::: Contest:", CONTEST_NAME);
    console.info("> Fetching page limit...");
    const limit = await getPageLimit();
    console.info("=== Page Limit:", limit);

    console.info("> Fetching all submissions...");
    const submissions = await fetchAllPages(limit);

    console.info("Total Submissions:", submissions.length);

    console.info("> Fetching questions...");
    const questions = await fetchQuestions();

    console.info("> Fetching codes...");
    const codes = fetchAllSubmissions(submissions, questions[3].question_id);
    console.info("Total Codes:", codes.length);
}

run();
