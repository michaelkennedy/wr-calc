// View model for a fixture entry.
// Pass the parent view model to check for validity.
// Should probably be able to pass the raw data from the API here.
var FixtureViewModel = function (parent) {
    this.homeId = ko.observable();
    this.awayId = ko.observable();
    this.homeScore = ko.observable();
    this.awayScore = ko.observable();

    this.homeRankingBefore = ko.observable();
    this.awayRankingBefore = ko.observable();

    this.venueNameAndCountry = null;
    this.venueCity = null;
    this.liveScoreMode = null;
    this.kickoff = null;
    this.alreadyInRankings = false;

    // Set once the fixture's match status is known. The timeline is only
    // meaningful once a match has kicked off.
    this.status = null;
    this.timelineApplicable = false;

    // Only set elsewhere for "event" mode
    this.homeCaption = 'Home...';
    this.awayCaption = 'Away...';
    this.eventPhase = null;

    this.noHome = ko.observable();
    this.switched = ko.observable();
    this.isRwc = ko.observable();

    this.triesMatter = ko.observable();
    this.pool = ko.observable();
    this.homeTries = ko.observable();
    this.awayTries = ko.observable();

    // Set when the fixture was loaded from the WR match API.
    this.matchId = null;

    // On-demand match detail (team sheets and officials) from the summary
    // API, and the match timeline on its own toggle. The parsed summary is
    // shared: the timeline needs its player-name map, so whichever panel is
    // opened first triggers the summary request exactly once.
    this.detail = ko.observable(null);
    this.detailVisible = ko.observable(false);
    this.detailLoading = ko.observable(false);
    this.timeline = ko.observable(null);
    this.timelineVisible = ko.observable(false);
    this.timelineLoading = ko.observable(false);
    var self = this;
    var parsedSummary = null;
    var getParsedSummary = function () {
        if (!parsedSummary) {
            parsedSummary = getJSON('https://api.wr-rims-prod.pulselive.com/rugby/v3/match/' + self.matchId + '/summary').then(parseMatchDetail);
        }
        return parsedSummary;
    };
    this.toggleDetail = function () {
        if (self.detailVisible()) {
            self.detailVisible(false);
            return;
        }
        self.detailVisible(true);
        if (!self.detail() && !self.detailLoading() && self.matchId) {
            self.detailLoading(true);
            getParsedSummary().then(function (detail) {
                self.detail(detail);
            }).catch(function () {
                self.detail({ error: true, officials: [], teams: [] });
            }).then(function () {
                self.detailLoading(false);
            });
        }
    };

    // The timeline is only meaningful once a match has kicked off
    // (timelineApplicable, set in wr-calc.js from the match status), and is
    // loaded eagerly - not just on click - as soon as that's true, so the
    // link can already show as greyed-out if the match turns out to have no
    // timeline data, rather than only discovering that after a click.
    // Cached in localStorage once a match is complete, mirroring how try
    // counts are cached below; a live match's timeline is still changing,
    // so isn't cached, and a fetch error isn't cached either since it might
    // be transient (worth retrying on the next load).
    //
    // The cache key carries a version: parseMatchTimeline's output shape has
    // changed more than once during development (fields added, the score
    // split into two), and a completed match's entry, once cached, is never
    // re-fetched - so an old-shaped cached object just renders with blank
    // fields forever against a newer template, silently. Bump TIMELINE_CACHE_VERSION
    // whenever parseMatchTimeline's return shape changes again, so stale
    // entries are abandoned (not read, not overwritten - just orphaned)
    // rather than causing this.
    this.loadTimeline = function () {
        if (self.timeline() || self.timelineLoading() || !self.matchId) {
            return;
        }
        var cacheKey = 'api/v3/match/' + self.matchId + '/timeline|parsed|v' + TIMELINE_CACHE_VERSION;
        if (self.status === 'C' && localStorage[cacheKey]) {
            self.timeline(JSON.parse(localStorage[cacheKey]));
            return;
        }
        self.timelineLoading(true);
        Promise.all([
            getParsedSummary(),
            getJSON('https://api.wr-rims-prod.pulselive.com/rugby/v3/match/' + self.matchId + '/timeline')
        ]).then(function (results) {
            var parsed = parseMatchTimeline(results[1], results[0].playerNames);
            self.timeline(parsed);
            if (self.status === 'C') {
                localStorage[cacheKey] = JSON.stringify(parsed);
            }
        }).catch(function () {
            self.timeline({ error: true, homeTeam: '', awayTeam: '', rows: [] });
        }).then(function () {
            self.timelineLoading(false);
        });
    };
    this.toggleTimeline = function () {
        if (self.timelineVisible()) {
            self.timelineVisible(false);
            return;
        }
        if (self.timelineAvailable() === false) {
            return;
        }
        self.timelineVisible(true);
        self.loadTimeline();
    };
    // null while unknown/loading, then true/false once we know whether this
    // match actually has timeline data - drives the greyed-out link state.
    this.timelineAvailable = ko.pureComputed(function () {
        var t = self.timeline();
        if (!t) {
            return null;
        }
        return !t.error && t.rows.length > 0;
    });

    // Flags for the currently selected teams.
    this.homeFlagSrc = ko.computed(function () {
        var rankings = parent.rankingsById();
        var home = rankings && rankings[this.homeId()];
        return home ? flagFor(home.team) : null;
    }, this);
    this.awayFlagSrc = ko.computed(function () {
        var rankings = parent.rankingsById();
        var away = rankings && rankings[this.awayId()];
        return away ? flagFor(away.team) : null;
    }, this);

    this.hasValidTeams = ko.computed(function () {
        var rankings = parent.rankingsById();
        var home = rankings[this.homeId()];
        var away = rankings[this.awayId()];
        return home && away && home != away;
    }, this);

    this.isValid = ko.computed(function() {
        var homeScore = parseInt(this.homeScore());
        var awayScore = parseInt(this.awayScore());

        return this.hasValidTeams() &&
            !isNaN(homeScore) &&
            !isNaN(awayScore);
    }, this);

    this.changes = ko.computed(function () {
        var noHome = this.noHome();
        var switched = this.switched();

        // Calculate the effective ranking of the "home" team depending on whether
        // it is really at home, or at a neutral venue, or even if the home team
        // is nominally away.
        var homeRanking = this.homeRankingBefore();
        if (!noHome) {
            if (!switched) {
                homeRanking = homeRanking + 3;
            } else {
                homeRanking = homeRanking - 3;
            }
        }

        // Calculate the ranking diff and cap it at 10 points.
        var rankingDiff = this.awayRankingBefore() - homeRanking; // home is higher = home loss, away is higher = away loss
        var cappedDiff = Math.min(10, Math.max(-10, rankingDiff));

        // A draw gives the home team one tenth of the diff.
        var drawChange = cappedDiff / 10;

        var rwcMult = this.isRwc() ? 2 : 1;
        return [
            rwcMult * 1.5 * (drawChange + 1),
            rwcMult * (drawChange + 1),
            rwcMult * drawChange,
            rwcMult * (drawChange - 1),
            rwcMult * 1.5 * (drawChange - 1)
        ];
    }, this);

    this.getDisplayChange = function(index) {
        var changes = this.changes();
        if (!changes) return null;
        var change = changes[index];
        if (isNaN(change)) return null;

        var formattedChange = Math.abs(change).toFixed(2);
        var prefix = change > 0 ? '<' : '';
        var suffix = change < 0 ? '>' : '';

        return prefix + formattedChange + suffix;
    };

    this.activeChange = ko.computed(function () {
        if (!this.isValid()) {
            return null;
        }

        var homeScore = parseInt(this.homeScore());
        var awayScore = parseInt(this.awayScore());

        if (homeScore > awayScore + 15) return 0;
        if (homeScore > awayScore) return 1;
        if (awayScore > homeScore + 15) return 4;
        if (awayScore > homeScore) return 3;
        return 2;
    }, this);

    return this;
};