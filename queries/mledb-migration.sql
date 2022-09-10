BEGIN TRANSACTION;
DO
$$
    DECLARE
        mle_org_id                 numeric;
        rl_game_id                 numeric;
        rl_doubles_game_mode_id    numeric;
        rl_standard_game_mode_id   numeric;
        conference_type_id         numeric;
        orange_conf_id             numeric;
        blue_conf_id               numeric;
        division_type_id           numeric;
        schedule_group_type_season numeric;
        schedule_group_type_week   numeric;
        pl_sg_id                   numeric;
        ml_sg_id                   numeric;
        cl_sg_id                   numeric;
        al_sg_id                   numeric;
        fl_sg_id                   numeric;
        scrimReportWebhook         varchar;
        matchReportWebhook         varchar;
        fr_stf_bearer_id           numeric;
        fr_ldr_bearer_id           numeric;
        fm_role_id                 numeric;
        gm_role_id                 numeric;
        agm_role_id                numeric;
        captain_role_id            numeric;
    BEGIN
        INSERT INTO sprocket.organization DEFAULT VALUES RETURNING id INTO mle_org_id;
        INSERT INTO sprocket.organization_profile ("organizationId", "name", "description", "websiteUrl",
                                                   "primaryColor",
                                                   "secondaryColor",
                                                   "logoUrl")
        VALUES (mle_org_id, 'Minor League Esports', 'Minor League Esports', 'https://mlesports.gg', '#2A4B82',
                '#FFFFFF',
                'https://mlesports.gg/wp-content/uploads/logo-mle-256.png');

        -- GAME, GAME MODES --
        INSERT INTO sprocket.game ("title") VALUES ('Rocket League') RETURNING id INTO rl_game_id;
        INSERT INTO sprocket.game_mode ("code", "description", "teamSize", "teamCount", "gameId")
        VALUES ('RL_DOUBLES', 'Doubles', 1, 2, rl_game_id)
        RETURNING id INTO rl_doubles_game_mode_id;
        INSERT INTO sprocket.game_mode ("code", "description", "teamSize", "teamCount", "gameId")
        VALUES ('RL_STANDARD', 'Standard', 1, 2, rl_game_id)
        RETURNING id INTO rl_standard_game_mode_id;

        -- CONFERENCES --
        INSERT INTO sprocket.franchise_group_type ("code", "description")
        VALUES ('CONF', 'Conference')
        RETURNING id INTO conference_type_id;

        INSERT INTO sprocket.franchise_group ("typeId") VALUES (conference_type_id) RETURNING id INTO orange_conf_id;
        INSERT INTO sprocket.franchise_group ("typeId") VALUES (conference_type_id) RETURNING id INTO blue_conf_id;

        INSERT INTO sprocket.franchise_group_profile ("name", "groupId")
        VALUES ('Orange', orange_conf_id),
               ('Blue', blue_conf_id);

        -- DIVISIONS --
        INSERT INTO sprocket.franchise_group_type ("code", "description")
        VALUES ('DIV', 'Division')
        RETURNING id INTO division_type_id;

        INSERT INTO mledb_bridge.division_to_franchise_group ("divison", "franchiseGroupId") (SELECT "name", nextval('sprocket."franchise_group_id_seq"')
                                                                                              FROM mledb.division
                                                                                              WHERE conference != 'META');

        INSERT INTO sprocket.franchise_group ("id", "typeId", "parentGroupId") (SELECT "franchiseGroupId", division_type_id, orange_conf_id
                                                                                FROM mledb_bridge.division_to_franchise_group AS BRIDGE
                                                                                         LEFT JOIN mledb.division AS MLEDB ON MLEDB.name = BRIDGE.divison
                                                                                WHERE MLEDB.conference = 'ORANGE');

        INSERT INTO sprocket.franchise_group ("id", "typeId", "parentGroupId") (SELECT "franchiseGroupId", division_type_id, blue_conf_id
                                                                                FROM mledb_bridge.division_to_franchise_group AS BRIDGE
                                                                                         LEFT JOIN mledb.division AS MLEDB ON MLEDB.name = BRIDGE.divison
                                                                                WHERE MLEDB.conference = 'BLUE');


        INSERT INTO sprocket.franchise_group_profile ("name", "groupId") (SELECT BRIDGE.divison, SPR.id
                                                                          FROM sprocket.franchise_group AS SPR
                                                                                   INNER JOIN mledb_bridge.division_to_franchise_group AS BRIDGE
                                                                                              ON BRIDGE."franchiseGroupId" = SPR.id);

        -- FRANCHISES --
        INSERT INTO mledb_bridge.team_to_franchise ("team", "franchiseId") (SELECT "name", nextval('sprocket."franchise_id_seq"')
                                                                            FROM mledb.team
                                                                            WHERE division_name != 'Meta');

        INSERT INTO sprocket.franchise ("id", "organizationId") (SELECT "franchiseId", mle_org_id FROM mledb_bridge.team_to_franchise);

        INSERT INTO sprocket.franchise_profile ("franchiseId", "title", "code", "primaryColor", "secondaryColor") (SELECT SPR.id,
                                                                                                                          MLEDB.name,
                                                                                                                          MLEDB.callsign,
                                                                                                                          BRANDING.primary_color,
                                                                                                                          BRANDING.secondary_color
                                                                                                                   FROM sprocket.franchise AS SPR
                                                                                                                            LEFT JOIN mledb_bridge.team_to_franchise AS BRIDGE
                                                                                                                                      ON BRIDGE."franchiseId" = SPR.id
                                                                                                                            LEFT JOIN mledb.team AS MLEDB ON MLEDB.name = BRIDGE.team
                                                                                                                            LEFT JOIN mledb.team_branding AS BRANDING ON BRANDING.team_name = MLEDB.name);
        /*
        INSERT INTO sprocket.permission_bearer DEFAULT VALUES RETURNING id INTO fr_ldr_bearer_id;
        INSERT INTO sprocket.permission_bearer DEFAULT VALUES RETURNING id INTO fr_stf_bearer_id;

        INSERT INTO sprocket.franchise_leadership_role (name, ordinal, "bearerId")
        VALUES ('Franchise Manager', 1, fr_ldr_bearer_id, rl_game_id);
        INSERT INTO sprocket.franchise_staff_role (name, ordinal, "bearerId", "gameId")
        VALUES ('General Manager', 1, fr_stf_bearer_id, rl_game_id),
               ('Assistant General Manager', 1, fr_stf_bearer_id, rl_game_id),
               ('Captain', 1, fr_stf_bearer_id, rl_game_id);

        INSERT INTO sprocket.franchise_leadership_seat ("roleId") VALUES (fm_role_id);
        INSERT INTO sprocket.franchise_staff_seat ("roleId") VALUES (gm_role_id);
        INSERT INTO sprocket.franchise_staff_seat ("roleId") VALUES (agm_role_id);
        INSERT INTO sprocket.franchise_staff_seat ("roleId") VALUES (agm_role_id);
        */

        -- SCHEDULE GROUP TYPES --
        INSERT INTO sprocket.schedule_group_type (name, code, "organizationId")
        VALUES ('Season', 'SEASON', mle_org_id)
        RETURNING id INTO schedule_group_type_season;

        INSERT INTO sprocket.schedule_group_type (name, code, "organizationId")
        VALUES ('Week', 'WEEK', mle_org_id)
        RETURNING id INTO schedule_group_type_week;

        -- ROSTER USAGE LIMITS --
        INSERT INTO sprocket.roster_role_use_limits (code, "perMode", total, "groupTypeId")
        VALUES ('FL', 7, 12, schedule_group_type_season),
               ('AL', 7, 12, schedule_group_type_season),
               ('CL', 7, 12, schedule_group_type_season),
               ('ML', 7, 12, schedule_group_type_season),
               ('PL', 7, 12, schedule_group_type_season);

        -- GAME SKILL GROUPS --
        pl_sg_id = nextval('sprocket."game_skill_group_id_seq"');
        ml_sg_id = nextval('sprocket."game_skill_group_id_seq"');
        cl_sg_id = nextval('sprocket."game_skill_group_id_seq"');
        al_sg_id = nextval('sprocket."game_skill_group_id_seq"');
        fl_sg_id = nextval('sprocket."game_skill_group_id_seq"');

        INSERT INTO sprocket.game_skill_group (id, ordinal, "salaryCap", "gameId", "roleUseLimitsId", "organizationId")
        VALUES (pl_sg_id, 1, 95.5, rl_game_id, (SELECT id FROM sprocket.roster_role_use_limits WHERE code = 'PL'),
                mle_org_id),
               (ml_sg_id, 2, 83.0, rl_game_id, (SELECT id FROM sprocket.roster_role_use_limits WHERE code = 'ML'),
                mle_org_id),
               (cl_sg_id, 3, 70.5, rl_game_id, (SELECT id FROM sprocket.roster_role_use_limits WHERE code = 'CL'),
                mle_org_id),
               (al_sg_id, 4, 58.0, rl_game_id, (SELECT id FROM sprocket.roster_role_use_limits WHERE code = 'AL'),
                mle_org_id),
               (fl_sg_id, 5, 42.5, rl_game_id, (SELECT id FROM sprocket.roster_role_use_limits WHERE code = 'FL'),
                mle_org_id);

        scrimReportWebhook =
                'https://discord.com/api/webhooks/1002240301223653466/xpYxFjommlDnYRZLEot8o5k-NT7GyPO0wkT6QZuhuvTY3DD7LMir57-aiZKAhyGOa5-E';
        matchReportWebhook =
                'https://discord.com/api/webhooks/1002240301223653466/xpYxFjommlDnYRZLEot8o5k-NT7GyPO0wkT6QZuhuvTY3DD7LMir57-aiZKAhyGOa5-E';

        INSERT INTO sprocket.game_skill_group_profile (code, description, "scrimReportWebhookUrl",
                                                       "matchReportWebhookUrl", "skillGroupId")
        VALUES ('PL', 'Premier League', scrimReportWebhook, matchReportWebhook, pl_sg_id),
               ('ML', 'Master League', scrimReportWebhook, matchReportWebhook, ml_sg_id),
               ('CL', 'Champion League', scrimReportWebhook, matchReportWebhook, cl_sg_id),
               ('AL', 'Academy League', scrimReportWebhook, matchReportWebhook, al_sg_id),
               ('FL', 'Foundation League', scrimReportWebhook, matchReportWebhook, fl_sg_id);

        -- TEAMS --
        INSERT INTO sprocket.team ("franchiseId", "skillGroupId") (SELECT F.id, GSG.id
                                                                   FROM sprocket.franchise F
                                                                            CROSS JOIN sprocket.game_skill_group GSG);

        -- USERS --
        INSERT INTO mledb_bridge.player_to_user ("playerId", "userId") (SELECT id, nextval('sprocket."user_id_seq"') FROM mledb.player);
        INSERT INTO sprocket."user" (id) (SELECT "userId" FROM mledb_bridge.player_to_user);
        INSERT INTO sprocket."user_profile" ("userId", "displayName", "email") (SELECT "userId",
                                                                                       (SELECT name
                                                                                        FROM mledb.player
                                                                                        WHERE "id" = mledb_bridge.player_to_user."playerId"),
                                                                                       'unknown@sprocket.gg' AS "email"
                                                                                FROM mledb_bridge.player_to_user);

        -- MEMBERS --
        INSERT INTO sprocket.member ("userId", "organizationId") (SELECT id, mle_org_id FROM sprocket."user");
        INSERT INTO sprocket.member_profile ("memberId", name) (SELECT M.id, UP."displayName"
                                                                FROM sprocket.member M
                                                                         LEFT JOIN sprocket."user" U ON U.id = m."userId"
                                                                         LEFT JOIN sprocket.user_profile UP ON UP."userId" = U.id);

        -- PLAYERS --
        INSERT INTO sprocket.player ("memberId", "skillGroupId", salary) (SELECT M.id,
                                                                                 (CASE
                                                                                      WHEN (MLE.league = 'PREMIER')
                                                                                          THEN (pl_sg_id)
                                                                                      WHEN (MLE.league = 'MASTER')
                                                                                          THEN (ml_sg_id)
                                                                                      WHEN (MLE.league = 'CHAMPION')
                                                                                          THEN (cl_sg_id)
                                                                                      WHEN (MLE.league = 'ACADEMY')
                                                                                          THEN (al_sg_id)
                                                                                      WHEN (MLE.league = 'FOUNDATION')
                                                                                          THEN (fl_sg_id) END),
                                                                                 MLE.salary
                                                                          FROM sprocket.member M
                                                                                   LEFT JOIN sprocket."user" U on U.id = m."userId"
                                                                                   LEFT JOIN mledb_bridge.player_to_user BRIDGE ON BRIDGE."userId" = U.id
                                                                                   LEFT JOIN mledb.player MLE ON MLE.id = BRIDGE."playerId"
                                                                          WHERE MLE.league IN
                                                                                ('FOUNDATION', 'ACADEMY', 'CHAMPION',
                                                                                 'MASTER', 'PREMIER'));

        -- MATCHES --
        INSERT INTO mledb_bridge.season_to_schedule_group ("seasonNumber", "scheduleGroupId") (SELECT S.season_number, nextval('sprocket."schedule_group_id_seq"')
                                                                                               FROM mledb.season S);

        INSERT INTO sprocket.schedule_group (id, start, end, description, "typeId", "gameId") (SELECT BRIDGE."scheduleGroupId",
                                                                                                      MLE.start_date,
                                                                                                      MLE.end_date,
                                                                                                      CONCAT('Season ', MLE.season_number),
                                                                                                      schedule_group_type_season,
                                                                                                      rl_game_id
                                                                                               FROM mledb_bridge.season_to_schedule_group BRIDGE
                                                                                                        LEFT JOIN mledb.season MLE ON BRIDGE."seasonNumber" = MLE.season_number);

        INSERT INTO mledb_bridge.match_to_schedule_group ("matchId", "weekScheduleGroupId") (SELECT M.id, nextval('sprocket."schedule_group_id_seq"')
                                                                                             FROM mledb.match M);

        INSERT INTO sprocket.schedule_group (id, start, end, description, "typeId", "gameId") (SELECT BRIDGE."weekScheduleGroupId",
                                                                                                      MLE.from,
                                                                                                      MLE.to,
                                                                                                      CONCAT('Week ', MLE.match_number),
                                                                                                      schedule_group_type_week,
                                                                                                      rl_game_id
                                                                                               FROM mledb_bridge.match_to_schedule_group BRIDGE
                                                                                                        LEFT JOIN mledb.match MLE ON MLE.id = BRIDGE."matchId");

        INSERT INTO mledb_bridge.fixture_to_fixture ("mleFixtureId", "sprocketFixtureId") (SELECT MLE.id, nextval('sprocket."schedule_fixture_id_seq"')
                                                                                           FROM mledb.fixture MLE);

        INSERT INTO sprocket.schedule_fixture ("scheduleGroupId", "homeFranchiseId", "awayFranchiseId") (SELECT BRIDGE."sprocketFixtureId",
                                                                                                                BRIDGE_HOME."franchiseId",
                                                                                                                BRIDGE_AWAY."franchiseId"
                                                                                                         FROM mledb_bridge.fixture_to_fixture BRIDGE
                                                                                                                  LEFT JOIN mledb.fixture MLE ON MLE.id = BRIDGE."mleFixtureId"
                                                                                                                  LEFT JOIN mledb_bridge.team_to_franchise BRIDGE_HOME
                                                                                                                            ON BRIDGE_HOME.team = MLE.home_name
                                                                                                                  LEFT JOIN mledb_bridge.team_to_franchise BRIDGE_AWAY
                                                                                                                            ON BRIDGE_AWAY.team = MLE.away_name);

        INSERT INTO sprocket.match_parent ("fixtureId") (SELECT BRIDGE."sprocketFixtureId"
                                                         FROM mledb.series S
                                                                  LEFT JOIN mledb.fixture F ON F.id = S.fixture_id
                                                                  LEFT JOIN mledb_bridge.fixture_to_fixture BRIDGE ON BRIDGE."mleFixtureId" = F.id
                                                         WHERE S.fixture_id IS NOT NULL
                                                         GROUP BY S.fixture_id);

        INSERT INTO mledb_bridge.series_to_match ("seriesId", "matchId") (SELECT S.id, nextval('sprocket."match_id_seq"')
                                                                          FROM mledb.series S
                                                                          WHERE S.fixture_id IS NOT NULL);

        INSERT INTO sprocket.match ("matchParentId", "gameModeId", "skillGroupId") (SELECT BRIDGE."matchId",
                                                                                           (SELECT id FROM sprocket.game_mode GM WHERE GM.code = MLE.mode),
                                                                                           (CASE
                                                                                                WHEN (MLE.league = 'PREMIER')
                                                                                                    THEN (pl_sg_id)
                                                                                                WHEN (MLE.league = 'MASTER')
                                                                                                    THEN (ml_sg_id)
                                                                                                WHEN (MLE.league = 'CHAMPION')
                                                                                                    THEN (cl_sg_id)
                                                                                                WHEN (MLE.league = 'ACADEMY')
                                                                                                    THEN (al_sg_id)
                                                                                                WHEN (MLE.league = 'FOUNDATION')
                                                                                                    THEN (fl_sg_id) END)
                                                                                    FROM mledb_bridge.series_to_match BRIDGE
                                                                                             LEFT JOIN mledb.series MLE ON BRIDGE."seriesId" = MLE.id
                                                                                    WHERE MLE.league IN
                                                                                          ('FOUNDATION', 'ACADEMY',
                                                                                           'CHAMPION',
                                                                                           'MASTER', 'PREMIER'));
    end
$$;

COMMIT;
ROLLBACK;