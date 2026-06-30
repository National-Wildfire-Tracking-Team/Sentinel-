"""
stations.py
Complete list of WSR-88D NEXRAD radar stations.
Each entry: (site_id, name, state, latitude, longitude)
"""

# CONUS + AK + HI + territories
NEXRAD_STATIONS = [
    # ── Southeast ────────────────────────────────────────────────────────────
    ("KBMX", "Birmingham",         "AL",  33.172,  -86.770),
    ("KEOX", "Ft. Rucker",         "AL",  31.461,  -85.459),
    ("KGWX", "Columbus AFB",       "MS",  33.897,  -88.329),
    ("KMOB", "Mobile",             "AL",  30.679,  -88.240),
    ("KHTX", "Huntsville",         "AL",  34.931,  -86.083),
    ("KEVX", "Eglin AFB",          "FL",  30.564,  -85.922),
    ("KJAX", "Jacksonville",       "FL",  30.485,  -81.702),
    ("KMLB", "Melbourne",          "FL",  28.113,  -80.654),
    ("KAMX", "Miami",              "FL",  25.611,  -80.413),
    ("KTBW", "Tampa Bay",          "FL",  27.705,  -82.402),
    ("KBYX", "Key West",           "FL",  24.598,  -81.703),
    ("KCLX", "Charleston",         "SC",  32.656,  -81.042),
    ("KCAE", "Columbia",           "SC",  33.949,  -81.119),
    ("KGSP", "Greer/Greenville",   "SC",  34.883,  -82.220),
    ("KFFC", "Atlanta",            "GA",  33.363,  -84.566),
    ("KJGX", "Robins AFB",         "GA",  32.675,  -83.351),
    ("KVAX", "Moody AFB",          "GA",  30.890,  -83.002),
    ("KTLH", "Tallahassee",        "FL",  30.398,  -84.329),
    ("KLIX", "New Orleans",        "LA",  30.337,  -89.825),
    ("KSHV", "Shreveport",         "LA",  32.451,  -93.841),
    ("KLCH", "Lake Charles",       "LA",  30.125,  -93.216),
    ("KPOE", "Ft. Polk",           "LA",  31.155,  -92.976),
    ("KDGX", "Brandon/Jackson",    "MS",  32.280,  -89.984),
    ("KGWX", "Columbus AFB",       "MS",  33.897,  -88.329),
    ("KNQA", "Memphis",            "TN",  35.345,  -89.873),
    ("KOHX", "Nashville",          "TN",  36.247,  -86.563),
    ("KMRX", "Morristown",         "TN",  36.168,  -83.402),
    # ── Mid-Atlantic ─────────────────────────────────────────────────────────
    ("KAKQ", "Norfolk",            "VA",  36.984,  -77.007),
    ("KFCX", "Roanoke",            "VA",  37.024,  -80.274),
    ("KLWX", "Sterling",           "VA",  38.975,  -77.478),
    ("KLGX", "Langley Hill",       "WA",  47.117, -124.107),
    ("KMHX", "Morehead City",      "NC",  34.776,  -76.876),
    ("KRAX", "Raleigh-Durham",     "NC",  35.665,  -78.490),
    ("KLTX", "Wilmington",         "NC",  33.989,  -78.429),
    ("KRLX", "Charleston",         "WV",  38.311,  -81.723),
    ("KPBZ", "Pittsburgh",         "PA",  40.532,  -80.219),
    ("KCCX", "State College",      "PA",  40.923,  -78.004),
    ("KDIX", "Philadelphia",       "NJ",  39.947,  -74.411),
    ("KOKX", "New York",           "NY",  40.866,  -72.864),
    ("KENX", "Albany",             "NY",  42.586,  -74.064),
    ("KBGM", "Binghamton",         "NY",  42.200,  -75.985),
    ("KBUF", "Buffalo",            "NY",  42.949,  -78.737),
    ("KTYX", "Montague",           "NY",  43.756,  -75.680),
    ("KCXX", "Burlington",         "VT",  44.511,  -73.166),
    ("KGYX", "Portland",           "ME",  43.891,  -70.257),
    ("KCBW", "Caribou",            "ME",  46.039,  -67.806),
    ("KBOX", "Boston",             "MA",  41.956,  -71.137),
    # ── Ohio Valley ──────────────────────────────────────────────────────────
    ("KILN", "Cincinnati",         "OH",  39.420,  -83.822),
    ("KCLE", "Cleveland",          "OH",  41.413,  -81.860),
    ("KDTX", "Detroit",            "MI",  42.700,  -83.472),
    ("KAPX", "Gaylord",            "MI",  44.907,  -84.720),
    ("KGRR", "Grand Rapids",       "MI",  42.894,  -85.545),
    ("KMQT", "Marquette",          "MI",  46.531,  -87.549),
    ("KGRB", "Green Bay",          "WI",  44.499,  -88.111),
    ("KARX", "La Crosse",          "WI",  43.823,  -91.191),
    ("KMKX", "Milwaukee",          "WI",  42.968,  -88.551),
    ("KMPX", "Minneapolis",        "MN",  44.849,  -93.565),
    ("KDLH", "Duluth",             "MN",  46.837,  -92.210),
    ("KFSD", "Sioux Falls",        "SD",  43.588,  -96.729),
    ("KABR", "Aberdeen",           "SD",  45.456,  -98.413),
    ("KBIS", "Bismarck",           "ND",  46.771, -100.760),
    ("KMBX", "Minot",              "ND",  48.393, -100.865),
    ("KMVX", "Grand Forks",        "ND",  47.528,  -97.325),
    ("KIND", "Indianapolis",       "IN",  39.708,  -86.280),
    ("KLOT", "Chicago",            "IL",  41.604,  -88.085),
    ("KILX", "Lincoln",            "IL",  40.151,  -89.337),
    ("KVWX", "Evansville",         "IN",  38.260,  -87.725),
    ("KLSX", "St. Louis",          "MO",  38.699,  -90.683),
    ("KSGF", "Springfield",        "MO",  37.235,  -93.400),
    ("KEAX", "Kansas City",        "MO",  38.810,  -94.264),
    ("KTWX", "Topeka",             "KS",  38.997,  -96.233),
    ("KDDC", "Dodge City",         "KS",  37.761, -100.019),
    ("KGLD", "Goodland",           "KS",  39.367, -101.700),
    ("KICT", "Wichita",            "KS",  37.655,  -97.443),
    ("KINX", "Tulsa",              "OK",  36.175,  -95.565),
    ("KOUN", "Norman",             "OK",  35.236,  -97.462),
    ("KTLX", "Oklahoma City",      "OK",  35.333,  -97.278),
    ("KVNX", "Vance AFB",          "OK",  36.741,  -98.128),
    ("KFDR", "Altus",              "OK",  34.362,  -98.977),
    ("KDYX", "Abilene",            "TX",  32.538,  -99.254),
    ("KEPZ", "El Paso",            "TX",  31.873, -104.692),
    ("KEWX", "San Antonio",        "TX",  29.704,  -98.029),
    ("KFWS", "Dallas-Ft. Worth",   "TX",  32.573,  -97.303),
    ("KGRK", "Ft. Hood",           "TX",  30.722,  -97.383),
    ("KHGX", "Houston",            "TX",  29.472,  -95.079),
    ("KSJT", "San Angelo",         "TX",  31.371, -100.492),
    ("KLBB", "Lubbock",            "TX",  33.654, -101.814),
    ("KMAF", "Midland",            "TX",  31.943, -102.189),
    ("KBRO", "Brownsville",        "TX",  25.916,  -97.419),
    ("KCRP", "Corpus Christi",     "TX",  27.784,  -97.511),
    # ── Northern Plains ──────────────────────────────────────────────────────
    ("KAMA", "Amarillo",           "TX",  35.234, -101.709),
    ("KRIW", "Riverton",           "WY",  43.066, -108.477),
    ("KCYS", "Cheyenne",           "WY",  41.152, -104.806),
    ("KPUX", "Pueblo",             "CO",  38.460, -104.182),
    ("KFTG", "Denver",             "CO",  39.787, -104.546),
    ("KGJX", "Grand Junction",     "CO",  39.062, -108.214),
    ("KLNX", "North Platte",       "NE",  41.958, -100.576),
    ("KUEX", "Hastings",           "NE",  40.321,  -98.442),
    ("KOAX", "Omaha",              "NE",  41.320,  -96.367),
    ("KLVX", "Louisville",         "KY",  37.975,  -85.944),
    ("KJKL", "Jackson",            "KY",  37.591,  -83.313),
    ("KHPX", "Ft. Campbell",       "KY",  36.737,  -87.285),
    # ── West ─────────────────────────────────────────────────────────────────
    ("KBHX", "Eureka",             "CA",  40.499, -124.292),
    ("KBBX", "Beale AFB",          "CA",  39.496, -121.632),
    ("KHNX", "San Joaquin Valley", "CA",  36.314, -119.632),
    ("KMUX", "San Francisco",      "CA",  37.155, -121.898),
    ("KDAX", "Sacramento",         "CA",  38.501, -121.678),
    ("KVBX", "Vandenberg",         "CA",  34.839, -120.399),
    ("KSOX", "Santa Ana Mtns",     "CA",  33.818, -117.636),
    ("KVTX", "Los Angeles",        "CA",  34.412, -119.180),
    ("KESX", "Las Vegas",          "NV",  35.701, -114.891),
    ("KLRX", "Elko",               "NV",  40.740, -116.803),
    ("KRGX", "Reno",               "NV",  39.754, -119.462),
    ("KICX", "Cedar City",         "UT",  37.591, -112.862),
    ("KMTX", "Salt Lake City",     "UT",  41.263, -112.448),
    ("KPDT", "Pendleton",          "OR",  45.691, -118.853),
    ("KRTX", "Portland",           "OR",  45.715, -122.965),
    ("KMAX", "Medford",            "OR",  42.081, -122.717),
    ("KBLO", "Flagstaff",          "AZ",  35.358, -111.370),
    ("KEMX", "Tucson",             "AZ",  31.894, -110.630),
    ("KIWA", "Phoenix",            "AZ",  33.289, -111.670),
    ("KYUX", "Yuma",               "AZ",  32.495, -114.657),
    ("KATX", "Seattle",            "WA",  48.195, -122.494),
    ("KOTX", "Spokane",            "WA",  47.681, -117.627),
    ("KCLX", "Charleston",         "SC",  32.656,  -81.042),  # dup filter ok
    # ── Northern Plains / Rockies ─────────────────────────────────────────────
    ("KBLX", "Billings",           "MT",  45.854, -108.607),
    ("KGGW", "Glasgow",            "MT",  48.206, -106.625),
    ("KTFX", "Great Falls",        "MT",  47.460, -111.384),
    ("KMSX", "Missoula",           "MT",  47.042, -113.987),
    # ── Alaska ───────────────────────────────────────────────────────────────
    ("PABC", "Bethel",             "AK",  60.793, -161.876),
    ("PACG", "Sitka",              "AK",  56.853, -135.529),
    ("PAEC", "Nome",               "AK",  64.511, -165.295),
    ("PAHG", "Anchorage",          "AK",  60.726, -151.349),
    ("PAIH", "Middleton Island",   "AK",  59.462, -146.303),
    ("PAKC", "King Salmon",        "AK",  58.679, -156.629),
    ("PAPD", "Fairbanks",          "AK",  65.036, -147.502),
    # ── Hawaii ───────────────────────────────────────────────────────────────
    ("PHKI", "South Kauai",        "HI",  21.894, -159.552),
    ("PHKM", "Kamuela",            "HI",  20.125, -155.778),
    ("PHMO", "Molokai",            "HI",  21.133, -157.180),
    ("PHWA", "South Oahu",         "HI",  21.494, -158.149),
    # ── Puerto Rico / Guam ────────────────────────────────────────────────────
    ("TJUA", "San Juan",           "PR",  18.116,  -66.078),
    ("PGUA", "Andersen AFB",       "GU",  13.455,  144.811),
]

# Deduplicate by site_id (keep first occurrence)
_seen = set()
_deduped = []
for entry in NEXRAD_STATIONS:
    if entry[0] not in _seen:
        _seen.add(entry[0])
        _deduped.append(entry)
NEXRAD_STATIONS = _deduped

# Fast lookup dict: site_id → (name, state, lat, lon)
STATION_MAP = {sid: (name, state, lat, lon) for sid, name, state, lat, lon in NEXRAD_STATIONS}


def nearest_stations(lat: float, lon: float, count: int = 5) -> list[str]:
    """Return the `count` nearest station IDs to the given lat/lon."""
    import math
    def dist(entry):
        _, _, slat, slon = STATION_MAP[entry[0]]
        dlat = slat - lat
        dlon = slon - lon
        return math.sqrt(dlat * dlat + dlon * dlon)

    ranked = sorted(NEXRAD_STATIONS, key=dist)
    return [r[0] for r in ranked[:count]]
