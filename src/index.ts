import { format } from "date-fns";
import { QaseApi, ResultCreate, RunCreate } from 'qaseio';
import { event, container, recorder } from 'codeceptjs';
const helpers = container.helpers();

const supportedHelpers = [
	'WebDriver',
	'Appium',
	'Nightmare',
	'Puppeteer',
	'Playwright',
	'TestCafe',
	'REST'
];

const defaultConfig = {
	apiKey: '',
	projectName: '',
	enabled: false,
};

let helper;

for (const helperName of supportedHelpers) {
	if (Object.keys(helpers).indexOf(helperName) > -1) {
		helper = helpers[helperName];
	}
}

module.exports = (config) => {
	config = Object.assign(defaultConfig, config);

	if (config.apiKey === '' || config.apiKey === undefined) throw new Error('Please provide proper Qaseio api key');
	if (config.projectName === '' || config.projectName === undefined) throw new Error('Please provide proper Qaseio project name');

	const qase = new QaseApi({ token: config.apiKey });

	let runId;
	let failedTests = [];
	const passedTests = [];
	const errors = {};
	const prefixTag = '@C';
	const defaultElapsedTime = '1000';
	const ids = [];

	const runName = config.runName ? config.runName : `New test run on ${format(new Date(), 'yyyy-MM-dd\'T\'HH:mm:ss.s')}`;

	async function _createTestRunResult(projectName: string, runId: string|number,  results: { caseId :number, status: 'passed' | 'failed', time_ms?: number, stacktrace?: string}) {
		try {
			const resultCreate: ResultCreate = { case_id: results.caseId, status: results.status, time_ms: results.time_ms, stacktrace: results.stacktrace };
			return qase.results.createResult(projectName, Number(runId), resultCreate);
		} catch (error) {
			console.log(`Cannot create test run result due to ${error}`);
		}
	}

	async function _addTestRun(projectName:string, runName:string, cases: Array<number>, description: string, testRunTags?: Array<string>) {
		try {
			const runCreate: RunCreate = { title: runName, cases, description, tags: testRunTags };
			const res = await qase.runs.createRun(projectName, runCreate);
			return res.data.result.id;
		} catch (error) {
			console.log(`Cannot create new test run due to ${JSON.stringify(error)}`);
		}
	}

	event.dispatcher.on(event.test.started, async (test) => {
		if (test.body) {
			if (test.body.includes('addExampleInTable')) {
				const qaseTag = /"qaseTag":"(@C\d+)"/.exec(test.title);
				if (qaseTag) {
					test.tags.push(qaseTag[1]);
				}
			}
		}
		test.startTime = Date.now();
	});

	const failedTestCaseIds = new Set();

	event.dispatcher.on(event.test.failed, async (test, err) => {
		test.endTime = Date.now();
		test.elapsed = Math.round(test.endTime - test.startTime);
		test.tags.forEach((tag) => {
			if (tag.includes(prefixTag)) {
				const caseId = parseInt(tag.split(prefixTag)[1], 10);
				if (!failedTestCaseIds.has(caseId)) {
					// else it also failed on retry so we shouldnt add in a duplicate
					failedTestCaseIds.add(caseId);
					failedTests.push({ case_id: caseId, elapsed: test.elapsed === 0 ? defaultElapsedTime : test.elapsed });
				}
				errors[tag.split(prefixTag)[1]] = err;
			}
		});
	});

	event.dispatcher.on(event.test.passed, (test) => {
		test.endTime = Date.now();
		test.elapsed = Math.round(test.endTime - test.startTime);
		test.tags.forEach(tag => {
			if (tag.includes(prefixTag)) {
				const caseId = parseInt(tag.split(prefixTag)[1], 10);
				// remove duplicates caused by retries
				if (failedTestCaseIds.has(caseId)) {
					failedTests = failedTests.filter(({ case_id }) => case_id !== caseId);
				}
				passedTests.push({ case_id: caseId, elapsed: test.elapsed === 0 ? defaultElapsedTime : test.elapsed });
			}
		});
	});

	event.dispatcher.once(event.all.after, () => {
		// CodeceptJS 4.x emits `event.all.after` synchronously and only awaits tasks
		// queued in the recorder before exiting. Wrap the async teardown in
		// `recorder.add` so the Qase API calls actually complete.
		recorder.add('publish results to Qase', async () => {
			const mergedTests = failedTests.concat(passedTests);

			mergedTests.forEach(test => {
				for (const [key, value] of Object.entries(test)) {
					if (key === 'case_id') {
						ids.push(value);
					}
				}
			});

			if (ids.length === 0) {
				console.log('Qase: no test cases tagged with @C<id> were run, nothing to report');
				return;
			}

			// Always create a fresh run per execution. `runName` already carries the
			// date; the previous "look up existing runs" logic could leave `runId`
			// undefined, after which results were posted with NaN and silently rejected.
			try {
				if (config.runId) {
					runId = config.runId;
				} else {
					runId = await _addTestRun(config.projectName, runName, ids, config.description, config.testRunTags);
				}
			} catch (error) {
				console.log(error);
			}

			if (!runId) {
				console.log('Qase: test run was not created, skipping result upload');
				return;
			}

			for (const test of passedTests) {
				try {
					await _createTestRunResult(config.projectName, runId, { caseId: test.case_id, status: 'passed', time_ms: test.elapsed } );
				} catch (e) {
					console.log(e);
				}
			}

			for (const test of failedTests) {
				try {
					const errorString = errors[test.case_id]['message'] ? errors[test.case_id]['message'].replace(/\u001b\[.*?m/g, '') : errors[test.case_id];

					await _createTestRunResult(config.projectName, runId, { caseId: test.case_id, status: 'failed', time_ms: test.elapsed, stacktrace: errorString } );
				} catch (e) {
					console.log(e);
				}
			}

			console.log(`Qase: reported ${passedTests.length} passed / ${failedTests.length} failed result(s) to run ${runId}`);
		}, true, false);
	});

	return this;
};
