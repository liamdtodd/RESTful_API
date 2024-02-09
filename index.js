const router = module.exports = require('express').Router();

router.use('/workout', require('./workout'));
router.use('/exercise', require('./exercise')); 
router.use('/users', require('./user'));
