const axios = require('axios');

async function getTodaysBibleVerse() {
  try {
    const response = await axios.get('https://beta.ourmanna.com/api/v1/get/?format=json');
    const verseData = response.data.verse.details;
    return verseData;
  } catch (error) {
    console.error('Error fetching Bible verse:', error.message);
    return null;
  }
}

module.exports = { getTodaysBibleVerse };