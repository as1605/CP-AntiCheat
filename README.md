# CP-AntiCheat
Flagging users who copied solutions in LeetCode and CodeForces contests

## Steps for Leetcode
- Get contest slug. For example `weekly-contest-408`.
- Install `node` and `yarn`. Install dependencies using `npm install` or `yarn`
- Fetch the ranklist and submissions using `node leetcode.js <contest_name_slug>`. For example,
```sh
node --max-old-space-size=8192 leetcode.js weekly-contest-408
```
- If you have selenium chrome web-driver installed on your system use the following example,
```sh
node --max-old-space-size=8192 leetcode-selenium.js weekly-contest-408
```
- The codes will be saved to `data/leetcode/<contest_name_slug>/codes/<question_id>/<lang>/<user>:<submission_id>.<lang>`
- The reports will be generated at `docs/leetcode/<contest_name_slug>`, available to read at https://as1605.github.io/CP-AntiCheat/

## Demo
![demo](demo.png)