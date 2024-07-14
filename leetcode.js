import fs from "fs";
import * as cliProgress from "cli-progress";
import colors from "ansi-colors";
import FastGlob from "fast-glob";
import { Dolos } from "@dodona/dolos-lib";

const CONTEST_NAME = process.argv[2];

const DIR = "data/leetcode/" + CONTEST_NAME;
fs.mkdirSync(DIR, { recursive: true });
const DIR_SUBMISSIONS = DIR + "/submissions";
fs.mkdirSync(DIR_SUBMISSIONS, { recursive: true });
const DIR_CODES = DIR + "/codes";
fs.mkdirSync(DIR_CODES, { recursive: true });

const BASE_URL = "https://leetcode.com/contest/api/ranking/" + CONTEST_NAME;
const headers = {
    "Referer": "https://leetcode.com/",
    // contest/" + CONTEST_NAME + "/ranking/",
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

const fetchPage = async (page, minSolved = 1, retry = true) => {
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

        submissions.push({ user: data.total_rank[i].user_slug, questions, rankPage: page });
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

const fetchSubmission = async (submissionId, user, rankPage, root = DIR_CODES, region = "US", retry = true) => {
    const file = rankPage + ":" + user + ":" + submissionId;

    const cache = FastGlob.sync(root + '/*/' + file + ".*");
    if (cache.length > 0) {
        return cache[0];
    }

    const domain = region === "CN" ? "leetcode.cn" : "leetcode.com";
    const res = (await fetch(`https://${domain}/api/submissions/${submissionId}`, { headers }));
    if (res.status !== 200) {
        if (retry) {
            console.info("\n ## Retrying submission", submissionId);
            return fetchSubmission(submissionId, user, rankPage, root, region, false);
        }
        console.error("\n--- Failed to fetch submission", submissionId);
        return "";
    }
    const data = await res.json();
    const ext = data.lang === "python3" ? "py" : data.lang === "javascript" ? "js" : data.lang;
    const dir = root + '/' + ext + '/';
    fs.mkdirSync(dir, { recursive: true });
    const path = dir + file + "." + ext;
    fs.writeFileSync(path, data.code, "utf-8");
    return path;
}

const fetchAllSubmissions = async (submissions, question_id, chunk = 6, ignoreCN = true) => {
    const codes = [];
    const attempts = submissions.map(({ user, questions, rankPage }) => (
        {
            user,
            question: questions.find(q => q.question_id == question_id && (!ignoreCN || q.data_region !== "CN")),
            rankPage,
        })
    ).filter(({ question }) => question);

    const bar = new cliProgress.SingleBar({
        format: 'Fetching submissions... |' + colors.green('{bar}') + '| {percentage}% || {value}/{total} Codes || Duration: {duration_formatted}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
    }, cliProgress.Presets.shades_classic);
    bar.start(attempts.length, 0);

    const DIR_QUESTION = DIR_CODES + '/' + question_id;
    fs.mkdirSync(DIR_QUESTION, { recursive: true });

    const promises = [];
    for (let i = 0; i < attempts.length; i++) {
        const { user, question, rankPage } = attempts[i];
        promises.push(fetchSubmission(
            question.submission_id,
            user,
            rankPage,
            DIR_QUESTION,
            question.data_region
        ).then(code => code && codes.push(code)).finally(() => bar.increment()));
        if (i % chunk === 0) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }

    bar.stop();
    return codes;
}

const publish = (round, problemName, pairs, tolerance = 0.9) => {
    const breakPath = (path) => path.split("/")[path.split("/").length - 1].split(":");
    const done = new Set();
    const matches = pairs.filter(pair => pair.similarity >= tolerance).map(pair => ({
        user1: breakPath(pair.leftFile.path)[1],
        submission1: breakPath(pair.leftFile.path)[2].split(".")[0],
        rank1: breakPath(pair.leftFile.path)[0],
        user2: breakPath(pair.rightFile.path)[1],
        submission2: breakPath(pair.rightFile.path)[2].split(".")[0],
        rank2: breakPath(pair.rightFile.path)[0],
        similarity: pair.similarity
    })).filter(({ user1, user2 }) => user1 !== user2).toSorted((a, b) => b.similarity - a.similarity);
    const rows = [];
    matches.forEach(({ user1, submission1, rank1, user2, submission2, rank2, similarity }) => {
        if (!done.has(user1) || !done.has(user2)) {
            rows.push([
                `[${user1}](https://leetcode.com/${user1})`,
                `[${submission1}](https://leetcode.com/contest/${round}/submissions/detail/${submission1}/)`,
                `[${rank1}](https://leetcode.com/contest/${round}/ranking/${rank1}/)`,
                `[${user2}](https://leetcode.com/${user2})`,
                `[${submission2}](https://leetcode.com/contest/${round}/submissions/detail/${submission2}/)`,
                `[${rank2}](https://leetcode.com/contest/${round}/ranking/${rank2}/)`,
                (similarity * 100).toPrecision(4)
            ].join("|"));
            done.add(user1);
            done.add(user2);
        }
    })


    fs.writeFileSync(`docs/leetcode/${round}.md`, `# Cheating Report for LeetCode Round [${round}](https://leetcode.com/contest/${round}/)

Here are the matching submissions with a similarity of ${tolerance * 100} % or more. The table below shows the users, their submissions, and the ranklist they are in. The last column shows the similarity percentage between the two submissions. 

Use the ranklist link to find the users to report!

## Problem ${problemName}

|User1|Submission|Ranklist|User2|Submission|Ranklist|Match|
|---|---|---|---|---|---|---|
` + rows.join("\n"));

    const old = fs.readFileSync("docs/README.md");
    fs.writeFileSync("docs/README.md", old + `\n- LeetCode Round [${round}](leetcode/${round}): **${rows.length}** Cheaters!`);
}

const run = async () => {
    console.info(":::::::: Contest:", CONTEST_NAME);
    console.info("\n> Fetching page limit...");
    const limit = await getPageLimit();
    console.info("=== Page Limit:", limit);

    console.info("\n> Fetching all submissions...");
    const submissions = await fetchAllPages(limit);

    console.info("Total Submissions:", submissions.length);

    console.info("\n> Fetching questions...");
    const questions = await fetchQuestions();
    console.info("Total Questions:", questions.length);
    const question = questions[process.argv[3] ?? 3];
    console.info("=== Picked Question", question);

    console.info("\n> Fetching codes...");
    const codes = await fetchAllSubmissions(submissions, question.question_id);
    console.info("Total Codes:", codes.length);

    console.info("\n> Analyzing codes...");
    const dolos = new Dolos({ minSimilarity: 0.8, maxFingerprintPercentage: 0.5 });
    const report = await dolos.analyzePaths(codes);

    publish(CONTEST_NAME, question.title_slug, report.allPairs(), 0.95);
    console.log("=== Results ===", "docs/leetcode/" + CONTEST_NAME + ".md");
}

run();
