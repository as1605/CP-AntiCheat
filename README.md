# CP-AntiCheat
Flagging users who copied solutions in LeetCode and CodeForces contests

## Steps
- Get contest slug. For example `weekly-contest-406`.
- Install `node` and `yarn`. Install dependencies using `npm install` or `yarn`
- Fetch the ranklist and submissions using `node leetcode.js <contest_name_slug>`. For example,
```sh
node leetcode.js weekly-contest-406
```
- The codes will be saved to `data/leetcode/<contest_name_slug>/codes/<question_id>/<lang>/<user>:<submission_id>.<lang>`
- The reports will be generated at `docs/leetcode/<contest_name_slug>`