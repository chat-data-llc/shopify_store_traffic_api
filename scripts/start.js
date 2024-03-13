

const fs = require('fs');
const readline = require('readline');

function generateDateString() {
    let currentDate = new Date();
  
    // Calculate the start date as the first of 3 months ago
    let startMonth = currentDate.getMonth() - 3;
    let startYear = currentDate.getFullYear();
    if (startMonth < 0) {
      startMonth += 12; // Adjust month if it goes into the previous year
      startYear--; // Decrease the year by one
    }
    let startDate = new Date(startYear, startMonth, 1);
  
    // Calculate the end date as the last day of 1 month ago
    let endMonth = currentDate.getMonth() - 1;
    let endYear = currentDate.getFullYear();
    if (endMonth < 0) {
      endMonth += 12; // Adjust month if it goes into the previous year
      endYear--; // Decrease the year by one
    }
    let endDate = new Date(endYear, endMonth + 1, 0); // The 0th day of the next month is the last day of the desired month
  
    // Format the dates
    function formatForURL(date) {
      let year = date.getFullYear();
      let month = ('0' + (date.getMonth() + 1)).slice(-2);
      let day = ('0' + date.getDate()).slice(-2);
      return `${year}%7C${month}%7C${day}`;
    }
  
    // Construct the final string
    return `&from=${formatForURL(startDate)}&to=${formatForURL(endDate)}`;
  }  

const getTraffic = async (domain) => {
    const url = `https://pro.similarweb.com/widgetApi/WebsiteOverview/EngagementVisits/SingleMetric?country=999&${generateDateString()}&includeSubDomains=true&isWindow=false&keys=${domain}&timeGranularity=Monthly&webSource=Total&ShouldGetVerifiedData=false`;
    const options = {
        method: 'GET',
        headers: {
            'cookie': `.DEVICETOKEN.SIMILARWEB.COM=${process.env.DEVICETOKEN}; .SGTOKEN.SIMILARWEB.COM=${process.env.SGTOKEN};`,
        }
    };
    const maxRetries = 3; // set the maximum number of retries here
    let retryCount = 0;
    while (retryCount < maxRetries) {
        try {
            const response = await fetch(url, options);
            const trafficData = await response.json();
            const totalVisits = trafficData.Data[domain].TotalVisits.toFixed(0)
            return totalVisits;
        } catch (err) {
            retryCount++;
            if (retryCount === maxRetries) {
                return 0;
            }
            // add a delay before retrying to avoid flooding the server with requests
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
    }
}

const checkRedirect = async (originalDomain) => {
    const shopifyDomain = `http://${originalDomain}`;
    const maxRetries = 3; // set the maximum number of retries here
    let retryCount = 0;
    while (retryCount < maxRetries) {
        try {
            const response = await fetch(shopifyDomain, {
                method: 'GET',
                redirect: 'manual' // This prevents the fetch call from following redirects automatically.
            });

            // If there is a redirect, the 'Location' header contains the URL it redirects to.
            if (response.status === 301 || response.status === 302) {
                const redirectedUrl = response.headers.get('location');
                return redirectedUrl;
            } else {
                return shopifyDomain;
            }
        } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
                return shopifyDomain;
            }
            // add a delay before retrying to avoid flooding the server with requests
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
    }
};

const getDomainsTraffic = async (originalDomain) => {
    //The shoipfy store name could be different from the domains it's hosted
    const redirectedUrl = await checkRedirect(originalDomain);
    const url = new URL(redirectedUrl);
    const domain = url.hostname.replace(/^www\./, '');
    const totalVisits = await getTraffic(domain);
    return totalVisits;
}

async function processStores() {
    const fileStream = fs.createReadStream('./data/stores.list');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    // Open a write stream for the output CSV file
    const csvStream = fs.createWriteStream('./data/stores_traffic.csv');
    // Write CSV header
    csvStream.write('Store,traffic\n');

    for await (const line of rl) {
        const store = line.trim(); // Assuming each line is a store URL
        if (!store) {
            continue;
        }
        const traffic = await getDomainsTraffic(store);
        // Write store and score to CSV
        console.log(`write ${store},${traffic}`)
        csvStream.write(`${store},${traffic}\n`);
    }
    csvStream.end(); // Close the stream
}


processStores().then(() => console.log('Process completed.'));
