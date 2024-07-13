import fs from "fs";

const CONTEST_NAME = process.argv[2];

const DIR = "data/leetcode/" + CONTEST_NAME;
fs.mkdirSync(DIR, { recursive: true });
const DIR_SUBMISSIONS = DIR + "/submissions";
fs.mkdirSync(DIR_SUBMISSIONS, { recursive: true });

const BASE_URL = "https://leetcode.com/contest/api/ranking/" + CONTEST_NAME;
const headers = {
    "Referer": "https://leetcode.com/contest/" + CONTEST_NAME + "/ranking/",
    "Referrer-Policy": "strict-origin-when-cross-origin"
}

const fetchPage = async (page, minSolved = 4) => {
    const path = DIR_SUBMISSIONS + "/" + page + ".json";
    if (fs.existsSync(path)) {
        return JSON.parse(fs.readFileSync(path));
    }

    const res = (await fetch(BASE_URL + "/?pagination=" + page + "&region=global", { headers }));
    if (res.status !== 200) {
        console.error("Failed to fetch page", page);
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

const fetchAll = async (pageLimit = 100) => {
    const submissions = [];
    for (let i = 1; i <= pageLimit; i++) {
        await fetchPage(i).then(page => submissions.push(...page));
    }
    return submissions;
}

const run = async () => {
    console.info(":::::::: Contest:", CONTEST_NAME);
    console.info("> Fetching page limit...");
    const limit = await getPageLimit();
    console.info("=== Page Limit:", limit);

    console.info("> Fetching all submissions...");
    const submissions = await fetchAll(limit);

    console.info("Total Submissions:", submissions.length);
}

run();
