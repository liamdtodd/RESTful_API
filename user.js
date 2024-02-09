const express = require('express');
const app = express();

const json2html = require('json-to-html');

const ds = require('./datastore');
const datastore = ds.datastore;

const bodyParser = require('body-parser');
const request = require('request');

var { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const router = express.Router();
const login = express.Router();

const WORKOUT = "Workout";
const USER = "User";

const CLIENT_ID = 'ItcirKGt2ogA5qnv9KOxXJHfrFuZM808';
const CLIENT_SECRET = 'FNR0I2pv0Yn5F1CVXC1-I5AfDZlcQLLnq7MB-snDresFBD8yEkMOQoN-TzbqpeNx';
const DOMAIN = 'dev-bh72y76mar6dhzql.us.auth0.com';

router.use(bodyParser.json());

function fromDatastore(item){
    item.id = item[datastore.KEY].id;
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


const { auth } = require('express-openid-connect');
const { requiresAuth } = require('express-openid-connect');

const config = {
    authRequired: false,
    auth0Logout: true,
    secret: 'a6fc11ac7d41df650fa61232b5d85856dfda772125272485780588e4a90f3096',
    baseURL: 'https://final-toddl.uw.r.appspot.com/users',
    clientID: CLIENT_ID,
    issuerBaseURL: `https://${DOMAIN}`
};
  
  // auth router attaches /login, /logout, and /callback routes to the baseURL
router.use(auth(config));

/*                  Model Functions                 */

function get_user(id) {
  const key = datastore.key([USER, parseInt(id, 10)]);
  return datastore.get(key).then((entity) => {
      if (entity[0] === undefined || entity[0] === null) {
          return entity;
      } else 
          return entity.map(fromDatastore);
  });
}

function get_users(){
	const q = datastore.createQuery(USER);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore);
		});
}

function get_users_paginated(req){
  var q = datastore.createQuery(USER).limit(5);
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

function create_user(user_info) {
    var key = datastore.key(USER);
    const self_url = "https://final-toddl.uw.r.appspot.com/users/" + key.id;
    const new_user = { "name": user_info.nickname, "workouts": [], "sub": user_info.sub, "created": user_info.updated_at, "self": self_url };
    return datastore.save({ "key": key, "data": new_user }).then(() => { return key });
}

function patch_user(user_id, workout_id, user, workout) {
    const key = datastore.key([USER, parseInt(user_id, 10)]);
    workout.self = "https://final-toddl.uw.r.appspot.com/workout/" + workout_id;
    workout.owner = user.name;
    user.workouts.push(workout);
    const updated_user = { "id": user.id, "name": user.name, "sub": user.sub, "created": user.created, "workouts": user.workouts, "self": user.self };
    patch_workout(user.name, workout_id, workout);
    return datastore.save({ "key": key, "data": updated_user });
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

function patch_workout(owner, workout_id, workout) {
    const key = datastore.key([WORKOUT, parseInt(workout_id, 10)]);
    const self_url = "https://final-toddl.uw.r.appspot.com/workout/" + workout_id;
    const updated_workout = { "name": workout.name, "group": workout.group, "owner": owner, "exercises": workout.exercises, "self": self_url };
    return datastore.save({ "key": key, "data": updated_workout});
}

/*                    Controller Functions                    */

  // req.isAuthenticated is provided from the auth router
router.get('/', (req, res) => {
    let unique = true;
    const all_users = get_users()
      .then((users) => {
        for (var x = 0; x < users.length; x++) {
          console.log('users[x]: ', users[x]);
          console.log('oidc: ', req.oidc.user);
          if (users[x].sub == req.oidc.user.sub)
            unique = false;
        }

        if (unique === true) {
          create_user(req.oidc.user);
        }
      });

    const users = get_users_paginated(req)
      .then((users) => {
        var object = {
          "length": users.items.length,
          "users": users.items
      }
      res.status(200).json(object)
      });
});

router.get('/userInfo', requiresAuth(), function(req, res) {
  let unique = true;
  const users = get_users()
    .then((users) => {
      for (var x = 0; x < users.length; x++) {
        if (users[x].sub == req.oidc.user.sub)
          unique = false;
      }

      if (unique === true) {
        create_user(req.oidc.user);
        res.status(200).json({
          "JWT": req.oidc.idToken,
          "User Sub": req.oidc.user.sub
        });
      } else
        res.json({
          "JWT": req.oidc.idToken,
          "User Sub": req.oidc.user.sub
        });
    });
});

router.get('/:id', checkJwt, function(req, res) {
  get_user(req.params.id)
    .then(user => {
      if (user[0] === undefined || user[0] === null) 
        res.status(404).json({ "Error": "No user with this user_id exists" });
      else {
        const accepts = req.accepts(['application/json']);
        if (!accepts)
          res.status(406).json({ "Error": "Client doesn't accept applicaition/json" });
        else {
          res.status(200).json({
            "id": req.params.id,
            "workouts": user[0].workouts,
            "created": user[0].created,
            "sub": user[0].sub,
            "self": req.protocol + "://" + req.get("host") + '/users/' + req.params.id
          });
        }
      }
    });
});

router.patch('/:id/workout/:workout_id', checkJwt, function(req, res) {
  if (req.get('content-type') !== 'application/json')
        res.status(415).json({ "Error": "Server only accepts application/json data" });
    else {
        get_user(req.params.id)
            .then(user => {
                if (user[0] === undefined || user[0] === null) 
                    res.status(404).json({ "Error": "No user with that user_id exists" });
                else {
                    get_workout(req.params.workout_id)
                        .then(workout => {
                            if (workout[0] === undefined || workout[0] === null)
                                res.status(404).json({ "Error": "No workout with that workout_id exists" });
                            else if (workout[0].owner !== null && workout[0].owner !== undefined)
                                res.status(403).json({ "Error": "This workout already belongs to a user" });                            
                            else {
                                patch_user(req.params.id, req.params.workout_id, user[0], workout[0]);
                                res.status(200).json({
                                    "id": req.params.id,
                                    "workouts": workout[0],
                                    "self": req.protocol + "://" + req.get("host") + '/users/' + req.params.id
                                });
                            }
                        });
                }
            });
    }
});

router.post('/login', function(req, res){
  const username = req.body.username;
  const password = req.body.password;
  var options = { method: 'POST',
          url: `https://${DOMAIN}/oauth/token`,
          headers: { 'content-type': 'application/json' },
          body:
           { grant_type: 'password',
             username: username,
             password: password,
             client_id: CLIENT_ID,
             client_secret: CLIENT_SECRET },
          json: true };
  request(options, (error, response, body) => {
      if (error){
          res.status(500).send(error);
      } else {
          res.send(body);
      }
  });

});

module.exports = router;