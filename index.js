import { connect } from 'puppeteer-real-browser';
import fs from 'fs';

let coin = 'Fb378tkeWwGn3QHdTwjCH4dKNXyWDK87UEBQUTG15Buq';

// Function to create a delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to solve Cloudflare CAPTCHA using the logic from checkStat
const solveCloudflareCaptcha = async (page) => {
  try {
    console.log("Attempting to solve CAPTCHA...");

    const elements = await page.$$('[name="cf-turnstile-response"]');

    if (elements.length > 0) {
      for (const element of elements) {
        try {
          const parentElement = await element.evaluateHandle(el => el.parentElement);
          const box = await parentElement.boundingBox();

          if (box) {
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;

            console.log('Clicking CAPTCHA element...');
            await page.mouse.click(x, y);
            await delay(4000);
          }
        } catch (err) {
          console.error("Error while clicking CAPTCHA element:", err);
        }
      }
    } else {
      console.log("No CAPTCHA elements found.");
    }
  } catch (error) {
    console.error("Error solving CAPTCHA:", error);
  }
};

// Function to handle Cloudflare CAPTCHA
const handleCloudflareCaptcha = async (page) => {
  try {
    while (true) {
      const currentUrl = page.url();
      if (currentUrl.includes('cloudflare.com')) {
        console.log("Cloudflare CAPTCHA detected. Attempting to solve...");

        // Wait for a couple of seconds before attempting to solve CAPTCHA
        await delay(1000);

        // Solve CAPTCHA using the logic from checkStat
        await solveCloudflareCaptcha(page);

        // Wait for some time to allow for potential navigation or further processing
        await page.waitForTimeout(3000);
      } else {
        break;
      }
    }
  } catch (error) {
    console.error("Error handling CAPTCHA:", error);
  }
};

async function scrollToEnd(page, elementSelector) {
  await page.evaluate(async (selector) => {
    const scrollableElement = document.querySelector(selector);

    if (scrollableElement) {
      let lastScrollTop = -1;

      while (true) {
        scrollableElement.scrollTop += scrollableElement.clientHeight;


        // Wait for the scroll to finish
        await new Promise(resolve => setTimeout(resolve, 300));

        const scrollTop = scrollableElement.scrollTop;

        // If scroll position hasn't changed, we've reached the bottom
        if (scrollTop === lastScrollTop) {
          break;
        }

        lastScrollTop = scrollTop;
      }
    } else {
      console.warn(`Element with selector "${selector}" not found.`);
    }
  }, elementSelector);
}


async function scrollAndExtractSolanaAddresses(page, elementSelector) {
  const solanaAddresses = new Set(); // This remains in the Node.js context

  await page.evaluate(async (selector) => {
    window.solanaAddresses = new Set();
    const scrollableElement = document.querySelector(selector);

    if (scrollableElement) {
      let lastScrollTop = -1;

      while (true) {
        // Now extract the Solana addresses after scrolling
        const makerAddressDivs = document.querySelectorAll('div.maker-address');
        for (const div of makerAddressDivs) {
          const link = await div.querySelector('a');
          if (link) {
            console.log(link);
            const href = link.href;
            const solanaAddress = href.split('/').pop();
            window.solanaAddresses.add(solanaAddress);
          }
        }

        scrollableElement.scrollTop += scrollableElement.clientHeight;

        // Wait for the scroll to finish
        await new Promise(resolve => setTimeout(resolve, 300));

        const scrollTop = scrollableElement.scrollTop;

        // If scroll position hasn't changed, we've reached the bottom
        if (scrollTop === lastScrollTop) {
          break;
        }

        lastScrollTop = scrollTop;
      }
    } else {
      console.warn(`Element with selector "${selector}" not found.`);
    }
  }, elementSelector);


    // Retrieve the stored addresses from the browser context
    const solanaAddressesArray = await page.evaluate(() => Array.from(window.solanaAddresses));
    return solanaAddressesArray;
}



(async () => {
  console.log("Connecting to browser...");
  try {
    const { page, browser } = await connect({ // Adjust as needed
	  headless : 'auto',
      turnstile: true, // Enable automatic CAPTCHA solving
      customConfig: {
        // You can specify custom configurations here if needed
      }
    });

    // Listen for new pages and close them immediately
    browser.on('targetcreated', async target => {
      if (target.type() === 'page') {
        const newPage = await target.page();
        await newPage.close();
        console.log('Closed a new tab that was opened.');
      }
    });

    // Set the user-agent and viewport to mimic Firefox or an Apple device
    await page.setUserAgent('AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    // Set custom headers if needed
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    });


    // Intercept and block requests to the specified domain
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (!request.url().includes('dextools')) {
        console.log(`Blocking request to: ${request.url()}`);
        request.abort();
      } else {
        request.continue();
      }
    });

    page.on('response', response => {
      // console.log(`Response URL: ${response.url()} - Status: ${response.status()}`);
    });

    console.log("Navigating to the initial URL...");
    await page.goto(`https://www.dextools.io/app/en/solana/pair-explorer/${coin}`, {
    });

    console.log("Found <nav> element. Extracting page content...");

    await delay(2000);


    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);


    // Extract page content
    const pageContent = await page.content();

    await delay(5000);

    // click on top traders tab
    const buttons = await page.$$(`button[role="tab"]`);
    for (const button of buttons) {
      const text = await page.evaluate(el => el.innerText, button);
      if (text.trim().toLowerCase().includes("top traders")) {
        button.click();
        break;
      }
    }

    await delay(5000);

    let addresses = await scrollAndExtractSolanaAddresses(page, `app-top-traders datatable-body`);

    console.log(addresses);
    console.log(addresses.length);

    // Log page content to the console
    // console.log(pageContent);

    // Save page content to a file
    fs.writeFileSync('pageContent.html', pageContent);

    console.log("Page content saved to 'pageContent.html'");


    // while (true) {
    //   const currentUrl = page.url();
    //   console.log(`Current URL: ${currentUrl}`);
    //
    //   // Check if <nav> element is present
    //   const navPresent = await page.$('app-root');
    //   if (navPresent) {
    //     console.log("Found <nav> element. Extracting page content...");
    //
    //     // Extract page content
    //     const pageContent = await page.content();
    //
    //     // Log page content to the console
    //     console.log(pageContent);
    //
    //     // Save page content to a file
    //     fs.writeFileSync('pageContent.html', pageContent);
    //
    //     console.log("Page content saved to 'pageContent.html'");
    //     break;
    //   } else {
    //     // Handle Cloudflare CAPTCHA if present
    //     await handleCloudflareCaptcha(page);
    //
    //     // Wait and retry
    //     console.log("Waiting and retrying...");
    //     await delay(1000); // Wait for a bit before checking again
    //   }
    // }

    console.log("Finished processing.");
    await delay(20000);
    // await browser.close();
    console.log("Browser closed.");

  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }
})();
