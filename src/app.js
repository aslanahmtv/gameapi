const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const Joi = require('joi');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { body, validationResult } = require('express-validator');
const express = require('express');
const cors = require('cors');
const logger = require('morgan');
const mongoose = require('mongoose');
const fs = require('fs');

require('dotenv').config();

const app = express();
const errorLogStream = fs.createWriteStream(path.join(__dirname, '../logs/error.log'), { flags: 'a' })

const DB_URL = process.env.DB_HOST + ":" + 
                process.env.DB_PORT + "/" +
                process.env.DB_NAME;

// Middlewares
app.use(helmet());
app.use(bodyParser.json());
app.use(cors());
app.use(logger('combined', { 
    skip: function (req, res) { return res.statusCode < 400 },
    stream: errorLogStream
  }))


//Database Connection
mongoose.connect(DB_URL, { useNewUrlParser: true })
    .then(() => console.log('Database Connection Successful'))
    .catch(err => console.error(err))

// Create User Schema
const userSchema = new mongoose.Schema({
    wallet: String,
    email: String,
    twitter: String,
    items:
    [{
        item: String
    }]
});

User = mongoose.model('User', userSchema);

//Validation functions
function validateRequest(req, res, schema) {
    const options = {
        abortEarly: false, // include all errors
        allowUnknown: true, // ignore unknown props
        stripUnknown: true // remove unknown props
    };
    const { error, value } = schema.validate(req.body, options);
    if (error) {
        res.status(500).send(`Validation error: ${error.details.map(x => x.message).join(', ')}`);
        return true;
    }
    return false;
}

function validateMessage(publicKey, message, signature) {
    const verified = nacl
                    .sign
                    .detached
                    .verify(
                        new TextEncoder().encode(message),
                        bs58.decode(signature),
                        bs58.decode(publicKey)
                    )
    return verified;
  }

// API Routes
// GET all users
app.get('/users', function (req, res) {
    User.find()
        .then((users) => res.send(users))
        .catch((err) => res.status(500).send('Error Occurred while Retrieving Users'))
});

// POST a new user data
app.post('/users', 
        [
            body('email').isEmail().normalizeEmail(),
            body('wallet').isBase58(),
            body('time').isString(),
            body('message').isString(),
        ],
    (req, res) => {

        const schema = Joi.object({
            email: Joi.string().email().required(),
            wallet: Joi.string().required(),
            twitter: Joi.string().required(),
            message: Joi.string().required(),
            time: Joi.string().required(),
        });
        if (validateRequest(req, res, schema)) {return};

        if (!validateMessage(req.body["wallet"], req.body["time"], req.body["message"]))
            {res.status(500).send(`Validation error: Invalid signature`); return};

        body('twitter').custom((value) => {
            const regex = /^@?([a-zA-Z0-9_]){1,15}$/; // regex pattern for a Twitter handle
            if (!regex.test(value)) {
                req.errors.push({ param: 'twitter', msg: 'Invalid Twitter handle' });
            }
        })
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userData = req.body;
        const user = new User(userData);
        user.save().then(() => {
            res.send(user);
        }).catch((err) => {
            res.status(500).send('Error Occurred while Retrieving Users');
        });
    }
);

// PUT/UPDATE an existing user data 
app.put('/users/:id', function (req, res) {
    const schema = Joi.object({
        time: Joi.string().required(),
        wallet: Joi.string().required(),
        items: Joi.array().required()
    });

    if (validateRequest(req, res, schema)) {return};
    if (!validateMessage(req.body["wallet"], req.body["time"], req.body["message"]))
        {res.status(500).send(`Validation error: Invalid signature`); return};

    let id = req.params.id;
    let userData = req.body;

    User.findByIdAndUpdate(id, userData, { new: true })
        .then((updatedUser) => res.send(updatedUser))
        .catch((err) => {
            res.status(500).send('Error Occurred Updating Users' + err);
            return;
        });
});


// Server Startup
app.listen(3000, function () {
    console.log('Server listening on port 3000');
});