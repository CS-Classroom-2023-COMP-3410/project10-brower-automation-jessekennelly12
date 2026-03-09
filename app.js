const puppeteer = require('puppeteer');
const fs = require('fs');

// TODO: Load the credentials from the 'credentials.json' file
// HINT: Use the 'fs' module to read and parse the file
const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {

    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Navigate to GitHub login page
    await page.goto('https://github.com/login', { waitUntil: 'networkidle2' });

    // TODO: Login to GitHub using the provided credentials
    // HINT: Use the 'type' method to input username and password, then click on the submit button
    await page.type('#login_field', credentials.username);
    await page.type('#password', credentials.password);
    await Promise.all([
        page.click('input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    console.log('After login URL:', page.url());

    //device verif
    if (page.url().includes('sessions/verified-device')) {
        console.log('GitHub is asking for device verification.');
        console.log('Complete the verification in the browser, then press Enter here in the terminal.');

        process.stdin.resume();
        await new Promise(resolve => process.stdin.once('data', resolve));

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
        console.log('After device verification URL:', page.url());
    }

    //2FA
    if (page.url().includes('sessions/two-factor')) {
        throw new Error('GitHub is asking for 2FA, so this script cannot continue automatically.');
    }

    // Wait for successful login
    await page.waitForSelector('meta[name="octolytics-actor-login"]', { timeout: 30000 });

    // Extract the actual GitHub username to be used later
    const actualUsername = await page.$eval(
        'meta[name="octolytics-actor-login"]',
        meta => meta.content
    );
    console.log('Logged in as:', actualUsername);

    const repositories = ["cheeriojs/cheerio", "axios/axios", "puppeteer/puppeteer"];

    for (const repo of repositories) {
        console.log('Visiting repo:', repo);
        await page.goto(`https://github.com/${repo}`, { waitUntil: 'networkidle2' });

        // TODO: Star the repository
        // HINT: Use selectors to identify and click on the star button
        await page.waitForSelector('form[action*="/star"] button, form[action*="/unstar"] button');

        const alreadyStarred = await page.$('form[action*="/unstar"] button');

        if (alreadyStarred) {
            console.log(`${repo} is already starred.`);
        } else {
            const starClicked = await page.evaluate(() => {
                const btn = document.querySelector('form[action*="/star"] button');
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            });

            if (starClicked) {
                console.log(`Starred ${repo}`);
            } else {
                console.log(`Could not star ${repo}`);
            }
        }

        await sleep(1000);
    }

    // TODO: Navigate to the user's starred repositories page
    console.log('Navigating to starred repos page...');
    await page.goto(`https://github.com/${actualUsername}?tab=stars`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    // TODO: Click on the "Create list" button
    console.log('Trying to create list...');
    await page.waitForSelector('button, a');

    const listAlreadyExists = await page.evaluate(() => {
        return document.body.innerText.includes('Node Libraries');
    });

    if (!listAlreadyExists) {
        const createListClicked = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('button, a'));
            const createListButton = elements.find(el => (el.textContent || '').trim().includes('Create list'));
            if (createListButton) {
                createListButton.click();
                return true;
            }
            return false;
        });

        if (!createListClicked) {
            console.log('Could not find "Create list" button.');
        }

        await sleep(1500);

        // TODO: Create a list named "Node Libraries"
        // HINT: Wait for the input field and type the list name
        const nameInput = await page.$(
            'input[placeholder*="name"], input[name*="name"], input[type="text"]'
        );

        if (nameInput) {
            console.log('Waiting for list name input...');
            await nameInput.click({ clickCount: 3 }).catch(() => {});
            await nameInput.type('Node Libraries');
        } else {
            console.log('Could not find list name input.');
        }

        const descriptionInput = await page.$(
            'textarea, input[placeholder*="description"], input[name*="description"]'
        );

        if (descriptionInput) {
            console.log('Filling list description...');
            await descriptionInput.click({ clickCount: 3 }).catch(() => {});
            await descriptionInput.type('Libraries for Node.js work');
        } else {
            console.log('Could not find description input.');
        }

        
        await sleep(1000);

        // Submit the form associated with the list name input instead of relying on button text
        const createSubmitted = await page.evaluate(() => {
            const nameInput =
              document.querySelector('input[placeholder*="name"], input[name*="name"], input[type="text"]');
            if (!nameInput) return false;

            const form = nameInput.closest('form');
            if (!form) return false;

            form.requestSubmit ? form.requestSubmit() : form.submit();
            return true;
        });

        if (createSubmitted) {
            console.log('Submitted form to create "Node Libraries" list.');
        } else {
            console.log('Could not submit the form to create the list.');
        }

        // Allow some time for the list creation process
        await sleep(2500);
    } else {
        console.log('"Node Libraries" already exists.');
    }

    
    await page.goto(`https://github.com/${actualUsername}?tab=stars`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const verifiedListExists = await page.evaluate(() => {
        return document.body.innerText.includes('Node Libraries');
    });

    if (!verifiedListExists) {
        console.log('Node Libraries was NOT actually created.');
        console.log('Inspect the page, then press Enter here in the terminal.');

        process.stdin.resume();
        await new Promise(resolve => process.stdin.once('data', resolve));

        await browser.close();
        return;
    }

    console.log('Verified that "Node Libraries" exists.');

    for (const repo of repositories) {
        console.log('Adding repo to list:', repo);

        await page.goto(`https://github.com/${actualUsername}?tab=stars`, { waitUntil: 'networkidle2' });
        await sleep(1500);

        
        const searchBoxFound = await page.evaluate((repoName) => {
            const shortName = repoName.split('/')[1];
            const inputs = Array.from(document.querySelectorAll('input'));

            const searchInput = inputs.find(el => {
                const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                const type = (el.getAttribute('type') || '').toLowerCase();
                const name = (el.getAttribute('name') || '').toLowerCase();

                return (
                    placeholder.includes('search') ||
                    aria.includes('search') ||
                    type === 'search' ||
                    name === 'q'
                );
            });

            if (!searchInput) return false;

            searchInput.focus();
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.value = shortName;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

            return true;
        }, repo);

        if (searchBoxFound) {
            await sleep(2000);
        }

        // TODO: Add this repository to the "Node Libraries" list
        // HINT: Open the dropdown, wait for it to load, and find the list by its name
        const dropdownOpened = await page.evaluate((repoName) => {
            const allLinks = Array.from(document.querySelectorAll('a[href]'));

            const repoLink = allLinks.find(a => {
                const href = a.getAttribute('href') || '';
                return href === `/${repoName}` || href.endsWith(`/${repoName}`);
            });

            if (!repoLink) {
                return false;
            }

            let current = repoLink;
            let depth = 0;
            let containerWithButton = null;

            while (current && current !== document.body && depth < 15) {
                const controls = current.querySelectorAll('button, summary');
                if (controls.length > 0) {
                    containerWithButton = current;
                    break;
                }
                current = current.parentElement;
                depth++;
            }

            if (!containerWithButton) {
                return false;
            }

            const controls = Array.from(containerWithButton.querySelectorAll('button, summary'));

            const dropdown = controls.find(el => {
                const text = (el.innerText || '').trim();
                const aria = (el.getAttribute('aria-label') || '').trim();
                const title = (el.getAttribute('title') || '').trim();

                return (
                    text.includes('Starred') ||
                    text.includes('Lists') ||
                    text.includes('Star') ||
                    aria.includes('Starred') ||
                    aria.includes('Lists') ||
                    aria.includes('Star') ||
                    title.includes('Starred') ||
                    title.includes('Lists') ||
                    title.includes('Star')
                );
            }) || controls[0];

            if (!dropdown) {
                return false;
            }

            dropdown.click();
            return true;
        }, repo);

        if (!dropdownOpened) {
            console.log(`Could not open dropdown for ${repo}`);
            continue;
        }

        await sleep(2000);

        const listClicked = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll('label, button, li, div, span'));

            const target = nodes.find(el => {
                const text = (el.innerText || '').trim();
                return text === 'Node Libraries' || text.includes('Node Libraries');
            });

            if (!target) {
                return false;
            }

            target.click();
            return true;
        });

        if (listClicked) {
            console.log(`Added ${repo} to Node Libraries`);
        } else {
            console.log(`Could not find Node Libraries for ${repo}`);
        }

        // Allow some time for the action to process
        await sleep(1000);

        // Close the dropdown to finalize the addition to the list
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(500);
    }

    console.log('Done.');

    // Close the browser
    await browser.close();
})();