export type GlobeConnection = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  label: string;
  altitude: number;
  intensity: number;
  probabilityWeight: number;
  color: [string, string];
};

export type GlobePoint = {
  lat: number;
  lng: number;
  size: number;
  color: string;
  label: string;
};

export const ISTANBUL = {
  label: "Istanbul",
  lat: 41.0082,
  lng: 28.9784,
};

type CapitalTarget = {
  label: string;
  country: string;
  lat: number;
  lng: number;
};

const CAPITAL_TARGETS: CapitalTarget[] = [
  { label: "Kabul", country: "Afghanistan", lat: 34.5553, lng: 69.2075 },
  { label: "Tirana", country: "Albania", lat: 41.3275, lng: 19.8187 },
  { label: "Algiers", country: "Algeria", lat: 36.7538, lng: 3.0588 },
  { label: "Andorra la Vella", country: "Andorra", lat: 42.5063, lng: 1.5218 },
  { label: "Luanda", country: "Angola", lat: -8.839, lng: 13.2894 },
  { label: "St. John's", country: "Antigua and Barbuda", lat: 17.1274, lng: -61.8468 },
  { label: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
  { label: "Yerevan", country: "Armenia", lat: 40.1792, lng: 44.4991 },
  { label: "Canberra", country: "Australia", lat: -35.2809, lng: 149.13 },
  { label: "Vienna", country: "Austria", lat: 48.2082, lng: 16.3738 },
  { label: "Baku", country: "Azerbaijan", lat: 40.4093, lng: 49.8671 },
  { label: "Nassau", country: "Bahamas", lat: 25.0443, lng: -77.3504 },
  { label: "Manama", country: "Bahrain", lat: 26.2235, lng: 50.5876 },
  { label: "Dhaka", country: "Bangladesh", lat: 23.8103, lng: 90.4125 },
  { label: "Bridgetown", country: "Barbados", lat: 13.0975, lng: -59.6167 },
  { label: "Minsk", country: "Belarus", lat: 53.9006, lng: 27.559 },
  { label: "Brussels", country: "Belgium", lat: 50.8503, lng: 4.3517 },
  { label: "Belmopan", country: "Belize", lat: 17.251, lng: -88.759 },
  { label: "Porto-Novo", country: "Benin", lat: 6.4969, lng: 2.6289 },
  { label: "Thimphu", country: "Bhutan", lat: 27.4728, lng: 89.639 },
  { label: "La Paz", country: "Bolivia", lat: -16.4897, lng: -68.1193 },
  { label: "Sarajevo", country: "Bosnia and Herzegovina", lat: 43.8563, lng: 18.4131 },
  { label: "Gaborone", country: "Botswana", lat: -24.6282, lng: 25.9231 },
  { label: "Brasilia", country: "Brazil", lat: -15.7939, lng: -47.8828 },
  { label: "Bandar Seri Begawan", country: "Brunei", lat: 4.9031, lng: 114.9398 },
  { label: "Sofia", country: "Bulgaria", lat: 42.6977, lng: 23.3219 },
  { label: "Ouagadougou", country: "Burkina Faso", lat: 12.3714, lng: -1.5197 },
  { label: "Gitega", country: "Burundi", lat: -3.4271, lng: 29.9246 },
  { label: "Praia", country: "Cabo Verde", lat: 14.933, lng: -23.5133 },
  { label: "Phnom Penh", country: "Cambodia", lat: 11.5564, lng: 104.9282 },
  { label: "Yaounde", country: "Cameroon", lat: 3.848, lng: 11.5021 },
  { label: "Ottawa", country: "Canada", lat: 45.4215, lng: -75.6972 },
  { label: "Bangui", country: "Central African Republic", lat: 4.3947, lng: 18.5582 },
  { label: "N'Djamena", country: "Chad", lat: 12.1348, lng: 15.0557 },
  { label: "Santiago", country: "Chile", lat: -33.4489, lng: -70.6693 },
  { label: "Beijing", country: "China", lat: 39.9042, lng: 116.4074 },
  { label: "Bogota", country: "Colombia", lat: 4.711, lng: -74.0721 },
  { label: "Moroni", country: "Comoros", lat: -11.7172, lng: 43.2473 },
  { label: "Kinshasa", country: "DR Congo", lat: -4.4419, lng: 15.2663 },
  { label: "Brazzaville", country: "Congo", lat: -4.2634, lng: 15.2429 },
  { label: "San Jose", country: "Costa Rica", lat: 9.9281, lng: -84.0907 },
  { label: "Yamoussoukro", country: "Cote d'Ivoire", lat: 6.8276, lng: -5.2893 },
  { label: "Zagreb", country: "Croatia", lat: 45.815, lng: 15.9819 },
  { label: "Havana", country: "Cuba", lat: 23.1136, lng: -82.3666 },
  { label: "Lefkosa", country: "Turkish Republic of Northern Cyprus", lat: 35.11, lng: 33.21 },
  { label: "Prague", country: "Czechia", lat: 50.0755, lng: 14.4378 },
  { label: "Copenhagen", country: "Denmark", lat: 55.6761, lng: 12.5683 },
  { label: "Djibouti", country: "Djibouti", lat: 11.5721, lng: 43.1456 },
  { label: "Roseau", country: "Dominica", lat: 15.3092, lng: -61.3794 },
  { label: "Santo Domingo", country: "Dominican Republic", lat: 18.4861, lng: -69.9312 },
  { label: "Dili", country: "East Timor", lat: -8.5569, lng: 125.5603 },
  { label: "Quito", country: "Ecuador", lat: -0.1807, lng: -78.4678 },
  { label: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357 },
  { label: "San Salvador", country: "El Salvador", lat: 13.6929, lng: -89.2182 },
  { label: "Malabo", country: "Equatorial Guinea", lat: 3.7504, lng: 8.7371 },
  { label: "Asmara", country: "Eritrea", lat: 15.3229, lng: 38.9251 },
  { label: "Tallinn", country: "Estonia", lat: 59.437, lng: 24.7536 },
  { label: "Mbabane", country: "Eswatini", lat: -26.3054, lng: 31.1367 },
  { label: "Addis Ababa", country: "Ethiopia", lat: 8.9806, lng: 38.7578 },
  { label: "Suva", country: "Fiji", lat: -18.1248, lng: 178.4501 },
  { label: "Helsinki", country: "Finland", lat: 60.1699, lng: 24.9384 },
  { label: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { label: "Libreville", country: "Gabon", lat: 0.4162, lng: 9.4673 },
  { label: "Banjul", country: "Gambia", lat: 13.4549, lng: -16.579 },
  { label: "Tbilisi", country: "Georgia", lat: 41.7151, lng: 44.8271 },
  { label: "Berlin", country: "Germany", lat: 52.52, lng: 13.405 },
  { label: "Accra", country: "Ghana", lat: 5.6037, lng: -0.187 },
  { label: "Athens", country: "Greece", lat: 37.9838, lng: 23.7275 },
  { label: "St. George's", country: "Grenada", lat: 12.0561, lng: -61.7488 },
  { label: "Guatemala City", country: "Guatemala", lat: 14.6349, lng: -90.5069 },
  { label: "Conakry", country: "Guinea", lat: 9.6412, lng: -13.5784 },
  { label: "Bissau", country: "Guinea-Bissau", lat: 11.8817, lng: -15.6178 },
  { label: "Georgetown", country: "Guyana", lat: 6.8013, lng: -58.1551 },
  { label: "Port-au-Prince", country: "Haiti", lat: 18.5944, lng: -72.3074 },
  { label: "Tegucigalpa", country: "Honduras", lat: 14.0723, lng: -87.1921 },
  { label: "Budapest", country: "Hungary", lat: 47.4979, lng: 19.0402 },
  { label: "Reykjavik", country: "Iceland", lat: 64.1466, lng: -21.9426 },
  { label: "New Delhi", country: "India", lat: 28.6139, lng: 77.209 },
  { label: "Jakarta", country: "Indonesia", lat: -6.2088, lng: 106.8456 },
  //{ label: "Tehran", country: "Iran", lat: 35.6892, lng: 51.389 },
  { label: "Baghdad", country: "Iraq", lat: 33.3152, lng: 44.3661 },
  { label: "Dublin", country: "Ireland", lat: 53.3498, lng: -6.2603 },
  //{ label: "Jerusalem", country: "Israel", lat: 31.7683, lng: 35.2137 },
  { label: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964 },
  { label: "Kingston", country: "Jamaica", lat: 17.9712, lng: -76.7936 },
  { label: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
  { label: "Amman", country: "Jordan", lat: 31.9539, lng: 35.9106 },
  { label: "Astana", country: "Kazakhstan", lat: 51.1694, lng: 71.4491 },
  { label: "Nairobi", country: "Kenya", lat: -1.2921, lng: 36.8219 },
  { label: "Tarawa", country: "Kiribati", lat: 1.4518, lng: 173.03 },
  { label: "Pristina", country: "Kosovo", lat: 42.6629, lng: 21.1655 },
  { label: "Kuwait City", country: "Kuwait", lat: 29.3759, lng: 47.9774 },
  { label: "Bishkek", country: "Kyrgyzstan", lat: 42.8746, lng: 74.5698 },
  { label: "Vientiane", country: "Laos", lat: 17.9757, lng: 102.6331 },
  { label: "Riga", country: "Latvia", lat: 56.9496, lng: 24.1052 },
  { label: "Beirut", country: "Lebanon", lat: 33.8938, lng: 35.5018 },
  { label: "Maseru", country: "Lesotho", lat: -29.31, lng: 27.4782 },
  { label: "Monrovia", country: "Liberia", lat: 6.3156, lng: -10.8074 },
  { label: "Tripoli", country: "Libya", lat: 32.8872, lng: 13.1913 },
  { label: "Vaduz", country: "Liechtenstein", lat: 47.141, lng: 9.5209 },
  { label: "Vilnius", country: "Lithuania", lat: 54.6872, lng: 25.2797 },
  { label: "Luxembourg", country: "Luxembourg", lat: 49.6116, lng: 6.1319 },
  { label: "Antananarivo", country: "Madagascar", lat: -18.8792, lng: 47.5079 },
  { label: "Lilongwe", country: "Malawi", lat: -13.9626, lng: 33.7741 },
  { label: "Kuala Lumpur", country: "Malaysia", lat: 3.139, lng: 101.6869 },
  { label: "Male", country: "Maldives", lat: 4.1755, lng: 73.5093 },
  { label: "Bamako", country: "Mali", lat: 12.6392, lng: -8.0029 },
  { label: "Valletta", country: "Malta", lat: 35.8989, lng: 14.5146 },
  { label: "Majuro", country: "Marshall Islands", lat: 7.1164, lng: 171.1858 },
  { label: "Nouakchott", country: "Mauritania", lat: 18.0735, lng: -15.9582 },
  { label: "Port Louis", country: "Mauritius", lat: -20.1609, lng: 57.5012 },
  { label: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332 },
  { label: "Palikir", country: "Micronesia", lat: 6.9248, lng: 158.1611 },
  { label: "Chisinau", country: "Moldova", lat: 47.0105, lng: 28.8638 },
  { label: "Monaco", country: "Monaco", lat: 43.7384, lng: 7.4246 },
  { label: "Ulaanbaatar", country: "Mongolia", lat: 47.8864, lng: 106.9057 },
  { label: "Podgorica", country: "Montenegro", lat: 42.4304, lng: 19.2594 },
  { label: "Rabat", country: "Morocco", lat: 34.0209, lng: -6.8416 },
  { label: "Maputo", country: "Mozambique", lat: -25.9692, lng: 32.5732 },
  { label: "Naypyidaw", country: "Myanmar", lat: 19.7633, lng: 96.0785 },
  { label: "Windhoek", country: "Namibia", lat: -22.5609, lng: 17.0658 },
  { label: "Yaren", country: "Nauru", lat: -0.5477, lng: 166.9209 },
  { label: "Kathmandu", country: "Nepal", lat: 27.7172, lng: 85.324 },
  { label: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041 },
  { label: "Wellington", country: "New Zealand", lat: -41.2865, lng: 174.7762 },
  { label: "Managua", country: "Nicaragua", lat: 12.114, lng: -86.2362 },
  { label: "Niamey", country: "Niger", lat: 13.5116, lng: 2.1254 },
  { label: "Abuja", country: "Nigeria", lat: 9.0765, lng: 7.3986 },
  //{ label: "Pyongyang", country: "North Korea", lat: 39.0392, lng: 125.7625 },
  { label: "Skopje", country: "North Macedonia", lat: 41.9981, lng: 21.4254 },
  { label: "Oslo", country: "Norway", lat: 59.9139, lng: 10.7522 },
  { label: "Muscat", country: "Oman", lat: 23.588, lng: 58.3829 },
  { label: "Islamabad", country: "Pakistan", lat: 33.6844, lng: 73.0479 },
  { label: "Ngerulmud", country: "Palau", lat: 7.5006, lng: 134.6242 },
  { label: "Kudus", country: "Palestine", lat: 31.77, lng: 35.23 },
  { label: "Panama City", country: "Panama", lat: 8.9824, lng: -79.5199 },
  { label: "Port Moresby", country: "Papua New Guinea", lat: -9.4438, lng: 147.1803 },
  { label: "Asuncion", country: "Paraguay", lat: -25.2637, lng: -57.5759 },
  { label: "Lima", country: "Peru", lat: -12.0464, lng: -77.0428 },
  { label: "Manila", country: "Philippines", lat: 14.5995, lng: 120.9842 },
  { label: "Warsaw", country: "Poland", lat: 52.2297, lng: 21.0122 },
  { label: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393 },
  { label: "Doha", country: "Qatar", lat: 25.2854, lng: 51.531 },
  { label: "Bucharest", country: "Romania", lat: 44.4268, lng: 26.1025 },
  { label: "Moscow", country: "Russia", lat: 55.7558, lng: 37.6173 },
  { label: "Kigali", country: "Rwanda", lat: -1.9441, lng: 30.0619 },
  { label: "Basseterre", country: "Saint Kitts and Nevis", lat: 17.3026, lng: -62.7177 },
  { label: "Castries", country: "Saint Lucia", lat: 14.0101, lng: -60.9875 },
  { label: "Kingstown", country: "Saint Vincent and the Grenadines", lat: 13.16, lng: -61.2248 },
  { label: "Apia", country: "Samoa", lat: -13.8507, lng: -171.7514 },
  { label: "San Marino", country: "San Marino", lat: 43.9424, lng: 12.4578 },
  { label: "Sao Tome", country: "Sao Tome and Principe", lat: 0.3365, lng: 6.7273 },
  { label: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lng: 46.6753 },
  { label: "Dakar", country: "Senegal", lat: 14.7167, lng: -17.4677 },
  { label: "Belgrade", country: "Serbia", lat: 44.7866, lng: 20.4489 },
  { label: "Victoria", country: "Seychelles", lat: -4.6191, lng: 55.4513 },
  { label: "Freetown", country: "Sierra Leone", lat: 8.4657, lng: -13.2317 },
  { label: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198 },
  { label: "Bratislava", country: "Slovakia", lat: 48.1486, lng: 17.1077 },
  { label: "Ljubljana", country: "Slovenia", lat: 46.0569, lng: 14.5058 },
  { label: "Honiara", country: "Solomon Islands", lat: -9.4456, lng: 159.9729 },
  { label: "Mogadishu", country: "Somalia", lat: 2.0469, lng: 45.3182 },
  { label: "Pretoria", country: "South Africa", lat: -25.7479, lng: 28.2293 },
  { label: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978 },
  { label: "Juba", country: "South Sudan", lat: 4.8594, lng: 31.5713 },
  { label: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
  { label: "Sri Jayawardenepura Kotte", country: "Sri Lanka", lat: 6.9271, lng: 79.8612 },
  { label: "Khartoum", country: "Sudan", lat: 15.5007, lng: 32.5599 },
  { label: "Paramaribo", country: "Suriname", lat: 5.852, lng: -55.2038 },
  { label: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686 },
  { label: "Bern", country: "Switzerland", lat: 46.948, lng: 7.4474 },
  { label: "Damascus", country: "Syria", lat: 33.5138, lng: 36.2765 },
  { label: "Taipei", country: "Taiwan", lat: 25.033, lng: 121.5654 },
  { label: "Dushanbe", country: "Tajikistan", lat: 38.5598, lng: 68.787 },
  { label: "Dodoma", country: "Tanzania", lat: -6.163, lng: 35.7516 },
  { label: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018 },
  { label: "Lome", country: "Togo", lat: 6.1725, lng: 1.2314 },
  { label: "Nuku'alofa", country: "Tonga", lat: -21.1394, lng: -175.2049 },
  { label: "Port of Spain", country: "Trinidad and Tobago", lat: 10.6549, lng: -61.5019 },
  { label: "Tunis", country: "Tunisia", lat: 36.8065, lng: 10.1815 },
  { label: "Ankara", country: "Turkey", lat: 39.9334, lng: 32.8597 },
  { label: "Ashgabat", country: "Turkmenistan", lat: 37.9601, lng: 58.3261 },
  { label: "Funafuti", country: "Tuvalu", lat: -8.5167, lng: 179.2167 },
  { label: "Kampala", country: "Uganda", lat: 0.3476, lng: 32.5825 },
  { label: "Kyiv", country: "Ukraine", lat: 50.4501, lng: 30.5234 },
  { label: "Abu Dhabi", country: "United Arab Emirates", lat: 24.4539, lng: 54.3773 },
  { label: "London", country: "United Kingdom", lat: 51.5072, lng: -0.1276 },
  { label: "Washington, DC", country: "United States", lat: 38.9072, lng: -77.0369 },
  { label: "Montevideo", country: "Uruguay", lat: -34.9011, lng: -56.1645 },
  { label: "Tashkent", country: "Uzbekistan", lat: 41.2995, lng: 69.2401 },
  { label: "Port Vila", country: "Vanuatu", lat: -17.7333, lng: 168.3273 },
  { label: "Vatican City", country: "Vatican City", lat: 41.9029, lng: 12.4534 },
  { label: "Caracas", country: "Venezuela", lat: 10.4806, lng: -66.9036 },
  { label: "Hanoi", country: "Vietnam", lat: 21.0278, lng: 105.8342 },
  { label: "Sanaa", country: "Yemen", lat: 15.3694, lng: 44.191 },
  { label: "Lusaka", country: "Zambia", lat: -15.3875, lng: 28.3228 },
  { label: "Harare", country: "Zimbabwe", lat: -17.8252, lng: 31.0335 },
];

const HIGH_INTENSITY_CAPITALS = new Set([
  "Abu Dhabi",
  "Amsterdam",
  "Ankara",
  "Astana",
  "Baku",
  "Beijing",
  "Berlin",
  "Brussels",
  "Doha",
  "London",
  "Madrid",
  "Moscow",
  "New Delhi",
  "Paris",
  "Riyadh",
  "Singapore",
  "Tokyo",
  "Washington, DC",
]);

const MEDIUM_INTENSITY_CAPITALS = new Set([
  "Athens",
  "Baghdad",
  "Bangkok",
  "Brasilia",
  "Bucharest",
  "Cairo",
  "Dublin",
  "Helsinki",
  "Islamabad",
  "Jakarta",
  "Jerusalem",
  "Kuala Lumpur",
  "Lisbon",
  "Ottawa",
  "Rome",
  "Seoul",
  "Stockholm",
  "Vienna",
  "Warsaw",
]);

function intensityForTarget(target: CapitalTarget, index: number) {
  if (HIGH_INTENSITY_CAPITALS.has(target.label)) {
    return 1.04 + (index % 3) * 0.05;
  }

  if (MEDIUM_INTENSITY_CAPITALS.has(target.label)) {
    return 1.00 + (index % 4) * 0.035;
  }

  return 0.96 + ((index * 13) % 18) / 100;
}

function altitudeForTarget(index: number, intensity: number) {
  const base = 0.18 + (index % 5) * 0.025;
  return base + (intensity - 1) * 0.05;
}

function probabilityWeightForTarget(target: CapitalTarget) {
  const isEurope =
    target.lat >= 35 && target.lat <= 72 && target.lng >= -25 && target.lng <= 45;
  const isEastAsia =
    target.lat >= 0 && target.lat <= 52 && target.lng >= 95 && target.lng <= 150;
  const isNorthAmerica =
    target.lat >= 15 && target.lat <= 62 && target.lng >= -170 && target.lng <= -50;
  const isAfrica =
    target.lat >= -36 && target.lat <= 38 && target.lng >= -20 && target.lng <= 55;
  const isSouthAmerica =
    target.lat >= -58 && target.lat <= 14 && target.lng >= -84 && target.lng <= -32;
  const isMiddleEastOrCentralAsia =
    target.lat >= 15 && target.lat <= 55 && target.lng >= 32 && target.lng <= 90;

  if (isEurope || isEastAsia || isNorthAmerica) return 1.35;
  if (isMiddleEastOrCentralAsia) return 1.15;
  if (isAfrica || isSouthAmerica) return 0.9;

  return 1;
}

export const globeConnections: GlobeConnection[] = CAPITAL_TARGETS.map(
  (target, index) => {
    const intensity = intensityForTarget(target, index);

    return {
      startLat: ISTANBUL.lat,
      startLng: ISTANBUL.lng,
      endLat: target.lat,
      endLng: target.lng,
      label: target.label,
      intensity,
      probabilityWeight: probabilityWeightForTarget(target),
      altitude: altitudeForTarget(index, intensity),
      color:
        intensity >= 1.2
          ? ["rgba(104, 247, 255, 1)", "rgba(104, 247, 255, 0.18)"]
          : ["rgba(53, 198, 255, 0.95)", "rgba(53, 198, 255, 0.14)"],
    };
  },
);

export const globePoints: GlobePoint[] = [
  {
    lat: ISTANBUL.lat,
    lng: ISTANBUL.lng,
    size: 0.2,
    color: "#ffffff",
    label: ISTANBUL.label,
  },
  ...CAPITAL_TARGETS.map((target, index) => {
    const intensity = intensityForTarget(target, index);

    return {
      lat: target.lat,
      lng: target.lng,
      size: intensity >= 1.2 ? 0.066 : 0.038,
      color: intensity >= 1.2 ? "#d9ffff" : "#8efbff",
      label: target.label,
    };
  }),
];
