/*
[Script]
http-response ^https?://ios\.prod\.ftl\.netflix\.com/iosui/user/.+path=%5B%22videos%22%2C%\d+%22%2C%22summary%22%5D script-path=https://raw.githubusercontent.com/yichahucha/surge/master/netflix_imdb.js,requires-body=1
http-request ^https?://ios\.prod\.ftl\.netflix\.com/iosui/user/.+path=%5B%22videos%22%2C%\d+%22%2C%22summary%22%5D script-path=https://raw.githubusercontent.com/yichahucha/surge/master/netflix_imdb.js

[MITM]
hostname = ios.prod.ftl.netflix.com
*/

const netflix_title_cache_key = "netflix_title_map";
if ($request.headers) {
    let url = $request.url;
    let decode_url = decodeURIComponent(url);
    let videos = decode_url.match(/"videos","(\d+)"/);
    let video_id = videos[1];
    let map = get_title_map();
    let title = map[video_id];
    let is_english = url.match(/languages=en/) ? true : false;
    if (!title && !is_english) {
        url = url.replace(/&languages=(.*?)&/, "&languages=en-US&");
    }
    url += "&path=" + encodeURIComponent("[" + videos[0] + ",\"details\"]");
    $done({ url });
} else {
    var imdb_api_keys = [
        "PlzBanMe",
        "f75e0253",
        "ae64ce8d",
        "b2650e38",
        "9bd135c2",
        "1a66ef12",
        "457fc4ff",
        "9cc1a9b7",
        "f6dfce0e",
        "e6bde2b9",
        "d7904fa3"];
    var tmp_imdb_api_keys = Array.from(imdb_api_keys);
    var imdb_api_key_cache_key = "imdb_api_key_1";
    var imdb_api_key = $persistentStore.read(imdb_api_key_cache_key);
    if (!imdb_api_key) update_IMDb_api_key();

    let body = $response.body;
    let obj = JSON.parse(body);

    try {
        let video_id = obj.paths[0][1];
        let video = obj.value.videos[video_id];

        let map = get_title_map();
        let title = map[video_id];
        if (!title) {
            title = video.summary.title;
            set_title_map(video_id, title, map);
        }

        let year = null;
        let type = video.summary.type;
        if (type == "movie") {
            year = video.details.releaseYear;
        }else if(type == "show") {
            type = "series";
        }
        
        request_IMDb_rating(title, year, type, null, function (data) {
            if (data) {
                let rating_message = get_rating_message(data);
                let country_message = get_country_message(data);
                let summary = obj.value.videos[video_id].summary;
                if (summary && summary.supplementalMessage) {
                    summary.supplementalMessage = country_message + "\n" + rating_message + "\n\n" + summary.supplementalMessage;
                } else {
                    summary["supplementalMessage"] = country_message + "\n" + rating_message;
                }
                body = JSON.stringify(obj);
                $done({ body });
            } else {
                $done({});
            }
        });
    } catch (error) {
        $done({});
        console.log("Netflix Data Parsing Error:\n" + error);
    }
}

function get_title_map() {
    let map = $persistentStore.read(netflix_title_cache_key);
    if (!map) {
        map = {};
    } else {
        map = JSON.parse(map);
    }
    return map;
}

function set_title_map(id, title, map) {
    map[id] = title;
    $persistentStore.write(JSON.stringify(map), netflix_title_cache_key);
}

function request_IMDb_rating(title, year, type, season, callback) {
    let url = "https://www.omdbapi.com/?t=" + encodeURI(title) + "&apikey=" + imdb_api_key;
    if (year) url += "&y=" + year;
    if (type) url += "&type=" + type;
    if (season) url += "&Season=" + season;
    console.log("Netflix IMDb Rating URL:\n" + url);
    $httpClient.get(url, function (error, response, data) {
        if (!error) {
            console.log("Netflix IMDb Rating Data:\n" + data);
            let obj = JSON.parse(data);
            if (response.status == 200) {
                if (obj.Response != "False") {
                    callback(obj);
                } else {
                    if (obj.Error == "Request limit reached!" && tmp_imdb_api_keys.length > 1) {
                        update_IMDb_api_key();
                        request_IMDb_rating(title, year, type, season, callback);
                    } else {
                        callback(null);
                    }
                }
            } else {
                callback(null);
            }
        } else {
            console.log("Netflix IMDb Rating Error:\n" + error);
            callback(null);
        }
    });
}

function update_IMDb_api_key() {
    if (imdb_api_key) tmp_imdb_api_keys.splice(tmp_imdb_api_keys.indexOf(imdb_api_key), 1);
    let index = Math.floor(Math.random() * tmp_imdb_api_keys.length);
    let api_key = tmp_imdb_api_keys[index];
    $persistentStore.write(api_key, imdb_api_key_cache_key);
    imdb_api_key = api_key;
}

function get_rating_message(data) {
    let ratings = data.Ratings;
    let rating_message = "IMDb:  ⭐️ N/A";
    if (ratings.length > 0) {
        let imdb_source = ratings[0]["Source"];
        if (imdb_source == "Internet Movie Database") {
            let imdb_votes = data.imdbVotes;
            let imdb_rating = ratings[0]["Value"];
            rating_message = "IMDb:  ⭐️ " + imdb_rating + "   " + imdb_votes;
            if (data.Type == "movie") {
                if (ratings.length > 1) {
                    let source = ratings[1]["Source"];
                    if (source == "Rotten Tomatoes") {
                        let tomatoes = ratings[1]["Value"];
                        rating_message += ".   Tomatoes:  🍅 " + tomatoes;
                    }
                }
            }
        }
    }
    return rating_message;
}

function get_country_message(data) {
    let country = data.Country;
    let countrys = country.split(", ");
    let emoji_country = "";
    countrys.forEach(item => {
        emoji_country += get_country_emoji(item) + " " + item + ", ";
    });
    return emoji_country.slice(0, -2);
}

function get_country_emoji(name) {
    const emoji_country_map = {
        "Chequered": "🏁",
        "Triangular": "🚩",
        "Crossed": "🎌",
        "Black": "🏴",
        "White": "🏳",
        "Rainbow": "🏳️‍🌈",
        "Pirate": "🏴‍☠️",
        "Ascension Island": "🇦🇨",
        "Andorra": "🇦🇩",
        "United Arab Emirates": "🇦🇪",
        "Afghanistan": "🇦🇫",
        "Antigua & Barbuda": "🇦🇬",
        "Anguilla": "🇦🇮",
        "Albania": "🇦🇱",
        "Armenia": "🇦🇲",
        "Angola": "🇦🇴",
        "Antarctica": "🇦🇶",
        "Argentina": "🇦🇷",
        "American Samoa": "🇦🇸",
        "Austria": "🇦🇹",
        "Australia": "🇦🇺",
        "Aruba": "🇦🇼",
        "Åland Islands": "🇦🇽",
        "Azerbaijan": "🇦🇿",
        "Bosnia & Herzegovina": "🇧🇦",
        "Barbados": "🇧🇧",
        "Bangladesh": "🇧🇩",
        "Belgium": "🇧🇪",
        "Burkina Faso": "🇧🇫",
        "Bulgaria": "🇧🇬",
        "Bahrain": "🇧🇭",
        "Burundi": "🇧🇮",
        "Benin": "🇧🇯",
        "St. Barthélemy": "🇧🇱",
        "Bermuda": "🇧🇲",
        "Brunei": "🇧🇳",
        "Bolivia": "🇧🇴",
        "Caribbean Netherlands": "🇧🇶",
        "Brazil": "🇧🇷",
        "Bahamas": "🇧🇸",
        "Bhutan": "🇧🇹",
        "Bouvet Island": "🇧🇻",
        "Botswana": "🇧🇼",
        "Belarus": "🇧🇾",
        "Belize": "🇧🇿",
        "Canada": "🇨🇦",
        "Cocos (Keeling) Islands": "🇨🇨",
        "Congo - Kinshasa": "🇨🇩",
        "Congo": "🇨🇩",
        "Central African Republic": "🇨🇫",
        "Congo - Brazzaville": "🇨🇬",
        "Switzerland": "🇨🇭",
        "Côte d’Ivoire": "🇨🇮",
        "Cook Islands": "🇨🇰",
        "Chile": "🇨🇱",
        "Cameroon": "🇨🇲",
        "China": "🇨🇳",
        "Colombia": "🇨🇴",
        "Clipperton Island": "🇨🇵",
        "Costa Rica": "🇨🇷",
        "Cuba": "🇨🇺",
        "Cape Verde": "🇨🇻",
        "Curaçao": "🇨🇼",
        "Christmas Island": "🇨🇽",
        "Cyprus": "🇨🇾",
        "Czechia": "🇨🇿",
        "Czech Republic": "🇨🇿",
        "Germany": "🇩🇪",
        "Diego Garcia": "🇩🇬",
        "Djibouti": "🇩🇯",
        "Denmark": "🇩🇰",
        "Dominica": "🇩🇲",
        "Dominican Republic": "🇩🇴",
        "Algeria": "🇩🇿",
        "Ceuta & Melilla": "🇪🇦",
        "Ecuador": "🇪🇨",
        "Estonia": "🇪🇪",
        "Egypt": "🇪🇬",
        "Western Sahara": "🇪🇭",
        "Eritrea": "🇪🇷",
        "Spain": "🇪🇸",
        "Ethiopia": "🇪🇹",
        "European Union": "🇪🇺",
        "Finland": "🇫🇮",
        "Fiji": "🇫🇯",
        "Falkland Islands": "🇫🇰",
        "Micronesia": "🇫🇲",
        "Faroe Islands": "🇫🇴",
        "France": "🇫🇷",
        "Gabon": "🇬🇦",
        "United Kingdom": "🇬🇧",
        "UK": "🇬🇧",
        "Grenada": "🇬🇩",
        "Georgia": "🇬🇪",
        "French Guiana": "🇬🇫",
        "Guernsey": "🇬🇬",
        "Ghana": "🇬🇭",
        "Gibraltar": "🇬🇮",
        "Greenland": "🇬🇱",
        "Gambia": "🇬🇲",
        "Guinea": "🇬🇳",
        "Guadeloupe": "🇬🇵",
        "Equatorial Guinea": "🇬🇶",
        "Greece": "🇬🇷",
        "South Georgia & South Sandwich Is lands": "🇬🇸",
        "Guatemala": "🇬🇹",
        "Guam": "🇬🇺",
        "Guinea-Bissau": "🇬🇼",
        "Guyana": "🇬🇾",
        "Hong Kong SAR China": "🇭🇰",
        "Hong Kong": "🇭🇰",
        "Heard & McDonald Islands": "🇭🇲",
        "Honduras": "🇭🇳",
        "Croatia": "🇭🇷",
        "Haiti": "🇭🇹",
        "Hungary": "🇭🇺",
        "Canary Islands": "🇮🇨",
        "Indonesia": "🇮🇩",
        "Ireland": "🇮🇪",
        "Israel": "🇮🇱",
        "Isle of Man": "🇮🇲",
        "India": "🇮🇳",
        "British Indian Ocean Territory": "🇮🇴",
        "Iraq": "🇮🇶",
        "Iran": "🇮🇷",
        "Iceland": "🇮🇸",
        "Italy": "🇮🇹",
        "Jersey": "🇯🇪",
        "Jamaica": "🇯🇲",
        "Jordan": "🇯🇴",
        "Japan": "🇯🇵",
        "Kenya": "🇰🇪",
        "Kyrgyzstan": "🇰🇬",
        "Cambodia": "🇰🇭",
        "Kiribati": "🇰🇮",
        "Comoros": "🇰🇲",
        "St. Kitts & Nevis": "🇰🇳",
        "North Korea": "🇰🇵",
        "South Korea": "🇰🇷",
        "Kuwait": "🇰🇼",
        "Cayman Islands": "🇰🇾",
        "Kazakhstan": "🇰🇿",
        "Laos": "🇱🇦",
        "Lebanon": "🇱🇧",
        "St. Lucia": "🇱🇨",
        "Liechtenstein": "🇱🇮",
        "Sri Lanka": "🇱🇰",
        "Liberia": "🇱🇷",
        "Lesotho": "🇱🇸",
        "Lithuania": "🇱🇹",
        "Luxembourg": "🇱🇺",
        "Latvia": "🇱🇻",
        "Libya": "🇱🇾",
        "Morocco": "🇲🇦",
        "Monaco": "🇲🇨",
        "Moldova": "🇲🇩",
        "Montenegro": "🇲🇪",
        "St. Martin": "🇲🇫",
        "Madagascar": "🇲🇬",
        "Marshall Islands": "🇲🇭",
        "North Macedonia": "🇲🇰",
        "Mali": "🇲🇱",
        "Myanmar (Burma)": "🇲🇲",
        "Mongolia": "🇲🇳",
        "Macau Sar China": "🇲🇴",
        "Northern Mariana Islands": "🇲🇵",
        "Martinique": "🇲🇶",
        "Mauritania": "🇲🇷",
        "Montserrat": "🇲🇸",
        "Malta": "🇲🇹",
        "Mauritius": "🇲🇺",
        "Maldives": "🇲🇻",
        "Malawi": "🇲🇼",
        "Mexico": "🇲🇽",
        "Malaysia": "🇲🇾",
        "Mozambique": "🇲🇿",
        "Namibia": "🇳🇦",
        "New Caledonia": "🇳🇨",
        "Niger": "🇳🇪",
        "Norfolk Island": "🇳🇫",
        "Nigeria": "🇳🇬",
        "Nicaragua": "🇳🇮",
        "Netherlands": "🇳🇱",
        "Norway": "🇳🇴",
        "Nepal": "🇳🇵",
        "Nauru": "🇳🇷",
        "Niue": "🇳🇺",
        "New Zealand": "🇳🇿",
        "Oman": "🇴🇲",
        "Panama": "🇵🇦",
        "Peru": "🇵🇪",
        "French Polynesia": "🇵🇫",
        "Papua New Guinea": "🇵🇬",
        "Philippines": "🇵🇭",
        "Pakistan": "🇵🇰",
        "Poland": "🇵🇱",
        "St. Pierre & Miquelon": "🇵🇲",
        "Pitcairn Islands": "🇵🇳",
        "Puerto Rico": "🇵🇷",
        "Palestinian Territories": "🇵🇸",
        "Portugal": "🇵🇹",
        "Palau": "🇵🇼",
        "Paraguay": "🇵🇾",
        "Qatar": "🇶🇦",
        "Réunion": "🇷🇪",
        "Romania": "🇷🇴",
        "Serbia": "🇷🇸",
        "Russia": "🇷🇺",
        "Rwanda": "🇷🇼",
        "Saudi Arabia": "🇸🇦",
        "Solomon Islands": "🇸🇧",
        "Seychelles": "🇸🇨",
        "Sudan": "🇸🇩",
        "Sweden": "🇸🇪",
        "Singapore": "🇸🇬",
        "St. Helena": "🇸🇭",
        "Slovenia": "🇸🇮",
        "Svalbard & Jan Mayen": "🇸🇯",
        "Slovakia": "🇸🇰",
        "Sierra Leone": "🇸🇱",
        "San Marino": "🇸🇲",
        "Senegal": "🇸🇳",
        "Somalia": "🇸🇴",
        "Suriname": "🇸🇷",
        "South Sudan": "🇸🇸",
        "São Tomé & Príncipe": "🇸🇹",
        "El Salvador": "🇸🇻",
        "Sint Maarten": "🇸🇽",
        "Syria": "🇸🇾",
        "Swaziland": "🇸🇿",
        "Tristan Da Cunha": "🇹🇦",
        "Turks & Caicos Islands": "🇹🇨",
        "Chad": "🇹🇩",
        "French Southern Territories": "🇹🇫",
        "Togo": "🇹🇬",
        "Thailand": "🇹🇭",
        "Tajikistan": "🇹🇯",
        "Tokelau": "🇹🇰",
        "Timor-Leste": "🇹🇱",
        "Turkmenistan": "🇹🇲",
        "Tunisia": "🇹🇳",
        "Tonga": "🇹🇴",
        "Turkey": "🇹🇷",
        "Trinidad & Tobago": "🇹🇹",
        "Tuvalu": "🇹🇻",
        "Taiwan": "🇨🇳",
        "Tanzania": "🇹🇿",
        "Ukraine": "🇺🇦",
        "Uganda": "🇺🇬",
        "U.S. Outlying Islands": "🇺🇲",
        "United Nations": "🇺🇳",
        "United States": "🇺🇸",
        "USA": "🇺🇸",
        "Uruguay": "🇺🇾",
        "Uzbekistan": "🇺🇿",
        "Vatican City": "🇻🇦",
        "St. Vincent & Grenadines": "🇻🇨",
        "Venezuela": "🇻🇪",
        "British Virgin Islands": "🇻🇬",
        "U.S. Virgin Islands": "🇻🇮",
        "Vietnam": "🇻🇳",
        "Vanuatu": "🇻🇺",
        "Wallis & Futuna": "🇼🇫",
        "Samoa": "🇼🇸",
        "Kosovo": "🇽🇰",
        "Yemen": "🇾🇪",
        "Mayotte": "🇾🇹",
        "South Africa": "🇿🇦",
        "Zambia": "🇿🇲",
        "Zimbabwe": "🇿🇼",
        "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
        "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
        "Wales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    }
    return emoji_country_map[name] ? emoji_country_map[name] : emoji_country_map["Chequered"];
}
