const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

var { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const ds = require('./datastore');
const datastore = ds.datastore;

const WORKOUT = "Workout";
const EXERCISE = "Exercise";

const DOMAIN = 'dev-bh72y76mar6dhzql.us.auth0.com';

router.use(bodyParser.json());

function fromDatastore(item) {
    item.id = item[ds.Datastore.KEY].id;
    return item;
}

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),
  
    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
});

/*          Model Functions             */

function get_workouts(req) {
    var q = datastore.createQuery(WORKOUT).limit(5);
    const results = {};
    var prev;
    if(Object.keys(req.query).includes("cursor")){
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);
    }
	return datastore.runQuery(q).then( (entities) => {
            results.items = entities[0].map(ds.fromDatastore);
            if(typeof prev !== 'undefined'){
                results.previous = prev;
            }
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
            }
			return results;
		});
}

function get_workout(id) {
    const key = datastore.key([WORKOUT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity;
        } else {
            return entity.map(fromDatastore);
        }
    });
}

function post_workout(name, group) {
    var key = datastore.key(WORKOUT);
    const self_url = "https://final-toddl.uw.r.appspot.com/workout/" + key.id; 
    const new_workout = { "name": name, "group": group, "owner": null, "exercises": [], "self": self_url }
    return datastore.save( { "key": key, "data": new_workout } ).then(() => { return key });
}

function put_workout(workout_id, name, group, owner, exercises) {
    const key = datastore.key([WORKOUT, parseInt(workout_id, 10)]);
    const self_url = "https://final-toddl.uw.r.appspot.com/workout/" + workout_id;
    const workout = { "name": name, "group": group, "owner": owner, "exercises": exercises, "self": self_url };
    return datastore.save({ "key": key, "data": workout });
}

function patch_workout(workout_id, exercise_id, workout, exercise) {
    const key = datastore.key([WORKOUT, parseInt(workout_id, 10)]);
    exercise.self = "https://final-toddl.uw.r.appspot.com/exercise/" + exercise_id;
    exercise.workout_id = workout_id;
    workout.exercises.push(exercise);
    const updated_workout = { "id": workout.id, "name": workout.name, "group": workout.group, "owner": workout.owner, "exercises": workout.exercises, "self": workout.self };
    patch_exercise(exercise_id, workout_id);
    return datastore.save({ "key": key, "data": updated_workout });
}

function delete_workout(id) {
    const key = datastore.key([WORKOUT, parseInt(id, 10)]);
    return datastore.delete(key);
}

function get_exercise(id) {
    const key = datastore.key([EXERCISE, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity;
        } else {
            return entity.map(fromDatastore);
        }
    });
}

function patch_exercise(exercise_id, workout_id) {
    const key = datastore.key([EXERCISE, parseInt(exercise_id, 10)]);
    const self_url = "https://final-toddl.uw.r.appspot.com/exercise/" + exercise_id;
    const exercise = { "workout_id": workout_id, "self": self_url };
    return datastore.save({ "key": key, "data": exercise});
}

function delete_exercise(id) {
    const key = datastore.key([EXERCISE, parseInt(id, 10)]);
    return datastore.delete(key);
}

/*              Controller Functions                */

router.delete('/', function(req, res) {
    res.set('Accept', 'GET, POST');
    res.status(405).json({ "Error": "Server doesn't allow this request at this URL" });
});

router.put('/', function(req, res) {
    res.set('Accept', 'GET, POST');
    res.status(405).json({ "Error": "Server doesn't allow this request at this URL" });
});

router.patch('/', function(req, res) {
    res.set('Accept', 'GET, POST');
    res.status(405).json({ "Error": "Server doesn't allow this request at this URL" });
});

router.get('/:id', checkJwt, function(req, res) {
    get_workout(req.params.id)
        .then(workout => {
            if (workout[0] === undefined || workout[0] === null) {
                res.status(404).json({ 'Error': 'No workout with this workout_id exists' });
            } else {
                const accepts = req.accepts(['application/json']);
                if (!accepts)
                    res.status(406).json({ "Error": "Client doesn't accept applicaition/json" });
                else {
                    res.status(200).json({
                        "id": req.params.id,
                        "name": workout[0].name,
                        "group": workout[0].group,
                        "owner": workout[0].owner,
                        "exercises": workout[0].exercises,
                        "self": req.protocol + "://" + req.get("host") + '/workout/' + req.params.id
                    });
                }
            }
        });
});

router.get('/', checkJwt, function(req, res){
    const workouts = get_workouts(req)
	.then( (workouts) => {
        const accepts = req.accepts(['application/json']);
        if (!accepts)
            res.status(406).json({ "Error": "Client doesn't accept applicaition/json" });
        else {
            var object = {
                "length": workouts.items.length,
                "workouts": workouts.items
            }
            res.status(200).json(object);
        }
    });
});

router.post('/', checkJwt, function (req, res) {
    if (req.get('content-type') !== 'application/json')
        res.status(415).json({ "Error": "Server only accepts application/json data." });
    else {
        if (req.body.name && req.body.group) {
            post_workout(req.body.name, req.body.group)
                .then(key => { res.status(201).json({
                    "id": key.id,
                    "name": req.body.name,
                    "group": req.body.group,
                    "owner": null,
                    "exercises": [],
                    "self": req.protocol + "://" + req.get("host") + '/workout/' + key.id
                })});
        } else 
            res.status(400).json({ "Error": "The request object is missing name or group" });
    } 
});

router.put('/:id', checkJwt, function(req, res) {
    if (req.get('content-type') !== 'application/json')
        res.status(415).json({ "Error": "Server only accepts application/json data." });
    else {
        get_workout(req.params.id)
            .then(workout => {
                if (workout[0] === undefined || workout[0] === null) 
                    res.status(404).json({ "Error": "No workout with that workout_id exists" });
                else {
                    if (req.body.name && req.body.group) {
                        put_workout(req.params.id, req.body.name, req.body.group, req.body.owner, workout[0].exercises);
                        res.status(200).json({
                            "id": req.params.id,
                            "name": req.body.name,
                            "group": req.body.group,
                            "owner": req.body.owner,
                            "exercises": workout[0].exercises,
                            "self": req.protocol + "://" + req.get("host") + '/workout/' + req.params.id
                        });
                    } else 
                        res.status(400).json({ "Error": "Attribute(s) missing" });
                }
            });
    }
});

router.patch('/:workout_id/exercise/:exercise_id', checkJwt, function(req, res) {
    if (req.get('content-type') !== 'application/json')
        res.status(415).json({ "Error": "Server only accepts application/json data" });
    else {
        get_workout(req.params.workout_id)
            .then(workout => {
                if (workout[0] === undefined || workout[0] === null) 
                    res.status(404).json({ "Error": "No workout with that workout_id exists" });
                else {
                    get_exercise(req.params.exercise_id)
                        .then(exercise => {
                            if (exercise[0] === undefined || exercise[0] === null)
                                res.status(404).json({ "Error": "No exercise with that exercise_id exists" });
                            else if (exercise[0].workout_id !== null && exercise[0].workout_id !== undefined)
                                res.status(403).json({ "Error": "This exercise already belongs to a workout" });                            
                            else {
                                patch_workout(req.params.workout_id, req.params.exercise_id, workout[0], exercise[0]);
                                res.status(200).json({
                                    "id": req.params.workout_id,
                                    "exercises": exercise[0],
                                    "self": req.protocol + "://" + req.get("host") + '/workout/' + req.params.workout_id
                                });
                            }
                        });
                }
            });
    }
});

router.delete('/:id', checkJwt, function (req, res) {
        get_workout(req.params.id)
            .then(workout => {
                if (workout[0] === undefined || workout[0] === null) 
                    res.status(404).json({ 'Error': 'No workout with this workout_id exists' });
                else { 
                    for (var x = 0; x < workout[0].exercises.length; x++) {
                        get_exercise(workout[0].exercises[x].id)
                            .then(exercise => {
                                if (exercise[0] === undefined || exercise[0] === null)
                                    console.log('no exercise');
                                else
                                    delete_exercise(exercise[0].id);
                        });
                    }

                    delete_workout(req.params.id);
                    res.status(204).end();
                }
            });
});

module.exports = router;