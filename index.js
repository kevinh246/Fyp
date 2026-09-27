const express = require("express");
const app = express();
const PORT = 3000;

const {
    getUserTrack,
    createPreferenceProfile,
    recommendTrack
} = require("./algorithm");

app.use(express.json());

app.post("/api/recommend", async (req, res) => {
    try {
        const {tracks} = req.body;

        // Validate input
        if (!Array.isArray(tracks)) {
            return res.status(400).json({
                error: "tracks must be of type array"
            });
        }


        if (tracks.length === 0) {
            return res.status(400).json({
                error: "At least one track is required"
            });
        }


        for (const track of tracks) {
            if (!track.title || !track.artist) {
                return res.status(400).json({
                    error: "Each track must have a title and an artist"
                });
            }
        }


        // Get metadata
        const inputTracks = [];

        for (const track of tracks) {
            const metadata = await getUserTrack(track.title, track.artist);
            inputTracks.push(
                metadata
            );
        }

        // Feature analysis. Creating user preference profile
        const preferenceProfile = createPreferenceProfile(inputTracks);

        console.log("\nUser temporary preference profile created!:");
        console.log(JSON.stringify(preferenceProfile, null, 2));

        // Call the recommendation function
        const recommendation = await recommendTrack( inputTracks, preferenceProfile);

        if (!recommendation) {
            console.log("No suitable recommendation found");
            return res.status(404).json({
                error: "No suitable recommendation found"
            });
        }


        // Send back the recommended track data
        return res.json({

            recommendation: {
                title: recommendation.title,
                artist: recommendation.artist,
                score: recommendation.score,
                mbid: recommendation.mbid
            },

            analysedTracks:
                inputTracks.map(
                    (track) => ({
                        title: track.title,
                        artist: track.artist,
                        mbid: track.mbid
                    })
                ),
            preferenceProfile
        });

    } 
    catch (error) {
        console.log(`Exception error: ${error.message}`);
        return res.status(500).json({
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`NextTrack API running on port ${PORT}`);
});
