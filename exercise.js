const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const ds = require('./datastore');

const datastore = ds.datastore;

const WORKOUT = "Workout";
const EXERCISE = "Exercise";

router.use(bodyParser.json());

function fromDatastore(item) {
    item.id = item[ds.Datastore.KEY].id;
    return item;
}

/*              Begin Model Functions               */

function get_exercises(req) {
    var q = datastore.createQuery(EXERCISE).limit(5);
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

function post_exercise(name, sets, reps) {
    var key = datastore.key(EXERCISE);
    const self_url = "https://final-toddl.uw.r.appspot.com/exercise/" + key.id; 
    const new_exercise = { "name": name, "sets": sets, "reps": reps, "workout_id": null, "self": self_url }
    return datastore.save( { "key": key, "data": new_exercise } ).then(() => { return key });
}

function put_exercise(exercise_id, name, sets, reps, workout_id) {
    const key = datastore.key([EXERCISE, parseInt(exercise_id, 10)]);
    const self_url = "https://final-toddl.uw.r.appspot.com/exercise/" + exercise_id;
    const exercise = { "id": exercise_id, "name": name, "sets": sets, "reps": reps, "workout_id": workout_id,  "self": self_url };
    return datastore.save({ "key": key, "data": exercise });
}

function patch_exercise(exercise_id, exercise, sets, reps) {
    const key = datastore.key([EXERCISE, parseInt(exercise_id, 10)]);
    const self_url = "https://final-toddl.uw.r.appspot.com/exercise/" + exercise_id;
    const updated_exercise = { "id": exercise_id, "name": exercise.name, "sets": sets, "reps": reps, "workout_id": exercise.workout_id,  "self": self_url };
    return datastore.save({ "key": key, "data": updated_exercise });
}

function delete_exercise(id) {
    const key = datastore.key([EXERCISE, parseInt(id, 10)]);
    return datastore.delete(key);
}

function delete_exercise_workout(workout_info, exercise_info) {
    const key = datastore.key([WORKOUT, parseInt(workout_info.id, 10)]);
    const updated_exercises = workout_info.exercises.filter(item => item !== exercise_info);
    const updated_workout = { "exercises": updated_exercises };
    datastore.save({ "key": key, "data": updated_workout });
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
})

router.get('/:id', function(req, res) {
    get_exercise(req.params.id)
        .then(exercise => {
            if (exercise[0] === undefined || exercise[0] === null) {
                res.status(404).json({ 'Error': 'No exercise with this exercise_id exists' });
            } else {
                const accepts = req.accepts(['application/json']);
                if (!accepts)
                    res.status(406).json({ "Error": "Client doesn't accept applicaition/json" });
                else {
                    res.status(200).json({
                        "id": req.params.id,
                        "name": exercise[0].name,
                        "sets": exercise[0].sets,
                        "reps": exercise[0].reps,
                        "workout_id": exercise[0].workout_id,
                        "self": req.protocol + "://" + req.get("host") + '/exercise/' + req.params.id
                    });
                }
            }
        });
});

router.get('/', function(req, res){
    const exercise = get_exercises(req)
	.then( (exercises) => {
        const accepts = req.accepts(['application/json']);
        if (!accepts)
            res.status(406).json({ "Error": "Client doesn't accept applicaition/json" });
        else {
            var object = {
                "length": exercises.items.length,
                "exercises": exercises.items
            }
            res.status(200).json(object);
        }
    });
});

router.post('/', function (req, res) {
    if (req.get('content-type') !== 'application/json')
        res.status(415).json({ "Error": "Server only accepts application/json data." });
    else {
        if (req.body.name && req.body.sets && req.body.reps) {
            post_exercise(req.body.name, req.body.sets, req.body.reps)
                .then(key => { res.status(201).json({
                    "id": key.id,
                    "name": req.body.name,
                    "sets": req.body.sets,
                    "reps": req.body.reps,
                    "workout_id": null,
                    "self": req.protocol + "://" + req.get("host") + '/exercise/' + key.id
                })});
        } else 
            res.status(400).jsond({ "Error": "The request object is missing the required attributes" });
    }
});

router.put('/:id', function(req, res) {
    if (req.get('content-type') !== 'application/json')
        res.status(415).json({ "Error": "Server only accepts application/json data." });
    else {
        get_exercise(req.params.id)
            .then(exercise => {
                if (exercise[0] === undefined || exercise[0] === null) 
                    res.status(404).json({ "Error": "No exercise with that exercise_id exists" });
                else {
                    if (req.body.name && req.body.sets && req.body.reps) {
                        put_exercise(req.params.id, req.body.name, req.body.sets, req.body.reps, exercise[0].workout_id);
                        res.status(200).json({
                            "id": req.params.id,
                            "name": req.body.name,
                            "sets": req.body.sets,
                            "reps": req.body.reps,
                            "workout_id": exercise[0].workout_id,
                            "self": req.protocol + "://" + req.get("host") + '/exercise/' + req.params.id
                        });
                    } else 
                        res.status(400).json({ "Error": "Attribute(s) missing" });
                }
            });
    }
});

router.patch('/:id', function(req, res) {
    if (req.get('content-type') !== 'application/json')
    res.status(415).json({ "Error": "Server only accepts application/json data." });
    else {
        get_exercise(req.params.id)
            .then(exercise => {
                if (exercise[0] === undefined || exercise[0] === null) 
                    res.status(404).json({ "Error": "No exercise with that exercise_id exists" });
                else {
                    if (req.body.sets && req.body.reps) {
                        patch_exercise(req.params.id, exercise[0], req.body.sets, req.body.reps);
                        res.status(200).json({
                            "id": req.params.id,
                            "name": exercise.name,
                            "sets": req.body.sets,
                            "reps": req.body.reps,
                            "workout_id": exercise[0].workout_id,
                            "self": req.protocol + "://" + req.get("host") + '/exercise/' + req.params.id
                        });
                    } else 
                        res.status(400).json({ "Error": "Attribute(s) missing" });
                }
            });
    }
});

router.delete('/:id', function (req, res) {
    get_exercise(req.params.id)
        .then(exercise => {
            if (exercise[0] === undefined || exercise[0] === null) 
                res.status(404).json({ 'Error': 'No exercise with this exercise_id exists' });
            else {
                if (exercise[0].workout_id !== null) {
                    get_workout(exercise[0].workout_id)
                        .then(workout => {
                            if (workout[0] === undefined || workout[0] === null) {
                                res.status(404).json({ 'Error': 'No workout with this workout_id exists' });
                            } else {
                                delete_exercise_workout(workout[0], exercise[0]);
                                delete_exercise(req.params.id);
                                res.status(204).end();
                            }
                        });
                } else {
                    delete_exercise(req.params.id);
                    res.status(204).end();
                }
            }
        });
});

module.exports = router;