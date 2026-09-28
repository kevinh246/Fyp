const assert = require("assert");

const {
    createPreferenceProfile,
    extractTrackFeatures,
    getStrongFeatures,
    filterSubmittedTracks,
    calculateScore
} = require("../algorithm");

describe("NextTrack Recommendation Core Functions (algorithm.js)", function () {

    // createPreferenceProfile()
    describe("createPreferenceProfile()", function () {

        it("should count genres and tags from all input tracks", function () {
            const tracks = [
                {
                    genres: ["pop", "dance"],
                    tags: ["party", "pop"]
                },
                {
                    genres: ["pop"],
                    tags: ["party"]
                },
                {
                    genres: ["rock"],
                    tags: ["live"]
                }
            ];

            const profile = createPreferenceProfile(tracks);

            assert.strictEqual(profile.trackCount, 3);
            assert.strictEqual(profile.genres.pop, 2);
            assert.strictEqual(profile.genres.dance, 1);
            assert.strictEqual(profile.genres.rock, 1);
            assert.strictEqual(profile.tags.party, 2);
            assert.strictEqual(profile.tags.pop, 1);
            assert.strictEqual(profile.tags.live, 1);
        });

        it("should keep genre and tag counts separately", function () {
            const tracks = [
                {
                    genres: ["pop"],
                    tags: ["pop"]
                },
                {
                    genres: ["pop"],
                    tags: ["dance"]
                }
            ];

            const profile = createPreferenceProfile(tracks);

            assert.strictEqual(profile.genres.pop, 2);
            assert.strictEqual(profile.tags.pop, 1);
            assert.strictEqual(profile.tags.dance, 1);
        });

        it("should correctly count repeated features", function () {
            const tracks = [
                {
                    genres: ["electro house"],
                    tags: ["electronic"]
                },
                {
                    genres: ["electro house"],
                    tags: ["electronic"]
                },
                {
                    genres: ["electro house"],
                    tags: ["party"]
                }
            ];

            const profile = createPreferenceProfile(tracks);

            assert.strictEqual(
                profile.genres["electro house"],
                3
            );

            assert.strictEqual(
                profile.tags.electronic,
                2
            );

            assert.strictEqual(
                profile.tags.party,
                1
            );
        });

        it("should create an empty user preference profile when no tracks are provided", function () {
            const profile = createPreferenceProfile([]);

            assert.strictEqual(profile.trackCount, 0);
            assert.deepStrictEqual(profile.genres, {});
            assert.deepStrictEqual(profile.tags, {});
        });

    });

    // extractTrackFeatures()
    describe("extractTrackFeatures()", function () {

        it("should extract track features from metadata", function () {
            const metadata = {
                id: "12345",
                title: "Test song",
                "artist-credit": [
                    {
                        name: "Test Artist"
                    }
                ],
                genres: [
                    {
                        name: "Pop"
                    },
                    {
                        name: "Dance"
                    }
                ],
                tags: [
                    {
                        name: "Party"
                    },
                    {
                        name: "Electronic"
                    }
                ],
                length: 200000,
                "first-release-date": "2020-01-01"
            };

            const result = extractTrackFeatures(metadata);

            assert.strictEqual(result.mbid, "12345");
            assert.strictEqual(result.title, "Test song");
            assert.strictEqual(result.artist, "Test Artist");
            assert.deepStrictEqual(
                result.genres,
                ["pop", "dance"]
            );
            assert.deepStrictEqual(
                result.tags,
                ["party", "electronic"]
            );
            assert.strictEqual(result.length, 200000);
            assert.strictEqual(
                result.firstReleaseDate,
                "2020-01-01"
            );
        });

        it("should use Unknown Artist when artist metadata is missing/ incomplete", function () {
            const metadata = {
                id: "123",
                title: "Unknown Song"
            };

            const result = extractTrackFeatures(metadata);

            assert.strictEqual(
                result.artist,
                "Unknown Artist"
            );
            assert.deepStrictEqual(result.genres, []);
            assert.deepStrictEqual(result.tags, []);
            assert.strictEqual(result.length, null);
            assert.strictEqual(
                result.firstReleaseDate,
                null
            );
        });
    });

    // getStrongFeatures()
    describe("getStrongFeatures()", function () {

        it("should return features ordered by their frequency", function () {
            const featureCounts = {
                pop: 3,
                dance: 2,
                rock: 1
            };

            const result = getStrongFeatures(
                featureCounts,
                3
            );

            assert.strictEqual(
                result[0].feature,
                "pop"
            );

            assert.strictEqual(
                result[1].feature,
                "dance"
            );

            assert.strictEqual(
                result[2].feature,
                "rock"
            );
        });

        it("should correctly calculate feature frequency", function () {
            const featureCounts = {
                pop: 3,
                dance: 1
            };

            const result = getStrongFeatures(
                featureCounts,
                4
            );

            assert.strictEqual(
                result[0].frequency,
                0.75
            );

            assert.strictEqual(
                result[1].frequency,
                0.25
            );
        });

        it("should return an empty array when no features exist", function () {
            const result = getStrongFeatures({}, 3);

            assert.deepStrictEqual(result, []);
        });
    });

    // filterSubmittedTracks()
    describe("filterSubmittedTracks()", function () {

        it("should remove tracks already submitted by the user", function () {
            const inputTracks = [
                {
                    mbid: "track-1"
                },
                {
                    mbid: "track-2"
                }
            ];

            const candidates = [
                {
                    id: "track-1",
                    title: "Already Played"
                },
                {
                    id: "track-3",
                    title: "New Track"
                },
                {
                    id: "track-4",
                    title: "Another New Track"
                }
            ];

            const result = filterSubmittedTracks(
                candidates,
                inputTracks
            );

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, "track-3");
            assert.strictEqual(result[1].id, "track-4");
        });

        it("should keep all candidates when none were submitted", function () {
            const inputTracks = [
                {
                    mbid: "track-1"
                }
            ];

            const candidates = [
                {
                    id: "track-2",
                    title: "Track Two"
                },
                {
                    id: "track-3",
                    title: "Track Three"
                }
            ];

            const result = filterSubmittedTracks(
                candidates,
                inputTracks
            );

            assert.strictEqual(result.length, 2);
        });

        it("should return an empty array when all candidates were submitted", function () {
            const inputTracks = [
                {
                    mbid: "track-1"
                },
                {
                    mbid: "track-2"
                }
            ];

            const candidates = [
                {
                    id: "track-1",
                    title: "Track One"
                },
                {
                    id: "track-2",
                    title: "Track Two"
                }
            ];

            const result = filterSubmittedTracks(
                candidates,
                inputTracks
            );

            assert.deepStrictEqual(result, []);
        });
    });

    // calculateScore()
    describe("calculateScore()", function () {

        it("should calculate a score for matching features", function () {
            const candidate = {
                genres: [
                    {
                        name: "pop"
                    }
                ],
                tags: [
                    {
                        name: "party"
                    }
                ]
            };

            const preferenceProfile = {
                trackCount: 4,
                genres: {
                    pop: 3
                },
                tags: {
                    party: 2
                }
            };

            const score = calculateScore(
                candidate,
                preferenceProfile
            );

            // Genre: 3 / 4 * 3 = 2.25
            // Tag:   2 / 4 * 1 = 0.50
            // Total: 2.75
            assert.strictEqual(score, 2.75);
        });

        it("should give genre similarity a higher weight than tag similarity", function () {
            const candidate = {
                genres: [
                    {
                        name: "pop"
                    }
                ],
                tags: [
                    {
                        name: "party"
                    }
                ]
            };

            const preferenceProfile = {
                trackCount: 2,
                genres: {
                    pop: 2
                },
                tags: {
                    party: 2
                }
            };

            const score = calculateScore(
                candidate,
                preferenceProfile
            );

            // Genre: 2 / 2 * 3 = 3
            // Tag:   2 / 2 * 1 = 1
            // Total: 4
            assert.strictEqual(score, 4);
        });

        it("should return zero when no features match", function () {
            const candidate = {
                genres: [
                    {
                        name: "rock"
                    }
                ],
                tags: [
                    {
                        name: "metal"
                    }
                ]
            };

            const preferenceProfile = {
                trackCount: 3,
                genres: {
                    pop: 2
                },
                tags: {
                    party: 2
                }
            };

            const score = calculateScore(
                candidate,
                preferenceProfile
            );

            assert.strictEqual(score, 0);
        });

        it("should calculate score using only matching genres", function () {
            const candidate = {
                genres: [
                    {
                        name: "pop"
                    }
                ],
                tags: [
                    {
                        name: "rock"
                    }
                ]
            };

            const preferenceProfile = {
                trackCount: 4,
                genres: {
                    pop: 2
                },
                tags: {
                    party: 3
                }
            };

            const score = calculateScore(
                candidate,
                preferenceProfile
            );

            // 2 / 4 * 3 = 1.5
            assert.strictEqual(score, 1.5);
        });

        it("should calculate a score using only matching tags", function () {
            const candidate = {
                genres: [
                    {
                        name: "rock"
                    }
                ],
                tags: [
                    {
                        name: "party"
                    }
                ]
            };

            const preferenceProfile = {
                trackCount: 4,
                genres: {
                    pop: 2
                },
                tags: {
                    party: 2
                }
            };

            const score = calculateScore(
                candidate,
                preferenceProfile
            );

            // 2 / 4 * 1 = 0.5
            assert.strictEqual(score, 0.5);
        });

        it("should add scores from multiple matching genres", function () {
            const candidate = {
                genres: [
                    {
                        name: "pop"
                    },
                    {
                        name: "dance"
                    }
                ],
                tags: []
            };

            const preferenceProfile = {
                trackCount: 4,
                genres: {
                    pop: 2,
                    dance: 1
                },
                tags: {}
            };

            const score = calculateScore(
                candidate,
                preferenceProfile
            );

            // Pop:   2 / 4 * 3 = 1.50
            // Dance: 1 / 4 * 3 = 0.75
            // Total: 2.25
            assert.strictEqual(score, 2.25);
        });

        it("should handle missing genres and tags", function () {
            const candidate = {};

            const preferenceProfile = {
                trackCount: 3,
                genres: {
                    pop: 2
                },
                tags: {
                    party: 1
                }
            };

            const score = calculateScore(
                candidate,
                preferenceProfile
            );

            assert.strictEqual(score, 0);
        });
    });
});
