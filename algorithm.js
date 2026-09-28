const MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2";
const USER_AGENT = "NextTrack/1.0 ";

const MUSICBRAINZ_DELAY = 5000; // 5000 ms = 5 seconds
const ERROR_DELAY_BEFORE_RETRY = 5000; // 5000 ms = 5 seconds

let lastMusicBrainzRequest = 0;

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function normalise(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

async function musicBrainzRequest(url, retries = 3) {
    const elapsed = Date.now() - lastMusicBrainzRequest;

    if (elapsed < MUSICBRAINZ_DELAY) {
        await sleep(MUSICBRAINZ_DELAY - elapsed);
    }

    for (let attempt = 1; attempt <= retries; attempt++) {

        try {
            lastMusicBrainzRequest = Date.now();

            const response = await fetch(url, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json"
                }
            });

            if (response.status === 503) {
                // 503 service unavailable,
                console.log("Error when calling MusicBrainz API (http 503) service unavailable!");

                // Pause for 5 seconds instead of just continue hammering the API
                await sleep(ERROR_DELAY_BEFORE_RETRY);
                continue;
            }

            if (!response.ok) {
                throw new Error(`MusicBrainz API request failed: ${response.status}`);
            }
            return await response.json();
        } 
        catch (error) {
            if (attempt === retries) {
                throw error;
            }

            console.log(`Exception error when calling MusicBrainz API: ${error}`);
            await sleep(ERROR_DELAY_BEFORE_RETRY);
        }
    }

    throw new Error("MusicBrainz API request failed");
}

// Search track to extract metadata from
async function searchTrack(title, artist) {
    const query =`recording:"${title}" AND artist:"${artist}"`;
    const url =`${MUSICBRAINZ_URL}/recording/` + `?query=${encodeURIComponent(query)}` + `&fmt=json` + `&limit=5`;

    const data = await musicBrainzRequest(url);

    // If no data found
    if (!data.recordings || data.recordings.length === 0) {
        return null;
    }

    const exactMatch =data.recordings.find((recording) => {
        const recordingTitle = normalise(recording.title);
        const recordingArtist =
            (recording["artist-credit" ] || [])
            .map((credit) => normalise(credit.name))
            .join(" ");

        return (
            recordingTitle === normalise(title) && 
            recordingArtist.includes(normalise(artist)
        ));
    });

    return (exactMatch || data.recordings[0]);
}

// Get metadata from a track
async function getRecordingMetadata(mbid) {
    const url =
        `${MUSICBRAINZ_URL}/recording/${mbid}` +
        `?inc=artist-credits+releases+genres+tags` +
        `&fmt=json`;

    return await musicBrainzRequest(url);
}

// Extract features from tracks
function extractTrackFeatures(metadata) {
    const artist = metadata["artist-credit"]?.[0]?.name || "Unknown Artist";
    const genres = (metadata.genres || []).map((genre) => normalise(genre.name));
    const tags = (metadata.tags || []).map((tag) => normalise(tag.name));

    return {
        mbid: metadata.id,
        title: metadata.title,
        artist,
        genres,
        tags,
        length: metadata.length || null,
        firstReleaseDate: metadata["first-release-date"] || null
    };
}

async function getUserTrack(title, artist) {
    console.log(`Searching for: ${title} - ${artist}`);
    const recording = await searchTrack(title, artist);

    if (!recording) {
        throw new Error(`Error searching for track: ${title}, ${artist}`);
    }

    // Extract metadata
    const metadata = await getRecordingMetadata(recording.id);

    // Return it after having features extracted from metadata
    return extractTrackFeatures(metadata);
}

// Create temporary user preference profile
function createPreferenceProfile(tracks) {
    const genreCounts = {};
    const tagCounts = {};

    for (const track of tracks) {
        for (const genre of track.genres) {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        }
        for (const tag of track.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
    }

    return {
        trackCount: tracks.length,
        genres: genreCounts,
        tags: tagCounts
    };
}

// Get strongest features
function getStrongFeatures(featureCounts, trackCount) {
    return Object.entries(featureCounts)
        .map(([feature, count]) => {
                return {
                    feature,
                    count,
                    frequency:count / trackCount
                };
            }
        )
        .sort((a, b) => b.frequency - a.frequency);
}

// Generate candidates
async function generateCandidates(preferenceProfile) {
    const candidateMap = new Map();
    const strongFeatures = [
        ...getStrongFeatures(
            preferenceProfile.genres,
            preferenceProfile.trackCount),
        ...getStrongFeatures(
            preferenceProfile.tags,
            preferenceProfile.trackCount
        )
    ]
    .sort((a, b) => b.frequency - a.frequency).slice(0, 2);

    if (strongFeatures.length === 0) {
        return [];
    }

    for (const item of strongFeatures) {
        console.log(`Searching for candidates using feature: ${item.feature}`);
        
        const query = `tag:"${item.feature}"`;
        const url =
            `${MUSICBRAINZ_URL}/recording/` +
            `?query=${encodeURIComponent(query)}` +
            `&fmt=json` +
            `&limit=5`;

        const data = await musicBrainzRequest(url);
        for (const recording of data.recordings || []) {
            if (!candidateMap.has(recording.id)) {
                candidateMap.set(
                    recording.id,
                    recording
                );
            }
        }
    }

    return Array.from(
        candidateMap.values()
    );
}

// Filter submitted tracks
function filterSubmittedTracks(candidates, inputTracks) {
    const submittedIds = new Set(inputTracks.map( (track) => track.mbid));

    // Filter out input tracks from candidates (if any)
    return candidates.filter(
        (candidate) => !submittedIds.has(candidate.id)
    );
}

// Score candidate
function calculateScore(candidate, preferenceProfile) {
    let score = 0;
    const trackCount = preferenceProfile.trackCount;

    const candidateGenres = (candidate.genres || []) 
        .map((genre) => normalise(genre.name));

    const candidateTags = (candidate.tags || [])
        .map((tag) => normalise(tag.name));

    // Genre similarity
    for (const genre of candidateGenres) {
        const frequency = preferenceProfile.genres[genre] || 0;
        if (frequency > 0) {
            score += (frequency / trackCount) * 3;
        }
    }

    // Tag for similarity
    for (const tag of candidateTags) {
        const frequency = preferenceProfile.tags[tag] || 0;
        if (frequency > 0) {
            score += (frequency / trackCount) * 1;
        }
    }

    return score;
}

// Recommend track
async function recommendTrack(inputTracks, preferenceProfile) {
    const rawCandidates = await generateCandidates(preferenceProfile);
    console.log(`Found ${rawCandidates.length} candidate recordings`);

    // Filter out any inputTracks if found in rawCandidates
    const candidates = filterSubmittedTracks(rawCandidates, inputTracks);
    console.log(`${candidates.length} candidates remain after filtering`);

    if (candidates.length === 0) {
        console.log(`Candidates not available: 0`);
        return null;
    }

    const scoredCandidates = [];
    const candidatesToScore = candidates.slice(0, 5); // Take 5 only

    for (const candidate of candidatesToScore) {
        try {
            console.log(`Analysing candidate: ${candidate.title}`);
            const metadata = await getRecordingMetadata(candidate.id);
            const features = extractTrackFeatures(metadata);
            const score = calculateScore(metadata, preferenceProfile);

            scoredCandidates.push({
                ...features,
                score
            });

        } 
        catch (error) {
            console.error(
                `Error when processing candidate: ${candidate.title}: ${error.message}`
            );
        }
    }

    scoredCandidates.sort((a, b) => b.score - a.score);
    return (scoredCandidates[0] || null);
}

module.exports = {
    getUserTrack,
    createPreferenceProfile,
    recommendTrack,

    // For unit testing
    searchTrack,
    getRecordingMetadata,
    extractTrackFeatures,
    getStrongFeatures,
    generateCandidates,
    filterSubmittedTracks,
    calculateScore
};
