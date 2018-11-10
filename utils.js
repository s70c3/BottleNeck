var MongoClient = require('mongodb').MongoClient;
//const http = require('http');
//const request = require("request");
const request = require('sync-request');

function find(array, value) {
    for (var i = 0; i < array.length; i++) {
        if (array[i] == value) return i;
    }
    return -1;
}

function randomInteger(min, max) {
    var rand = min - 0.5 + Math.random() * (max - min + 1)
    rand = Math.round(rand);
    return rand;
}

function randomTextMin() {
    let arr = [
        "There is no coffee. Ask you friend to make it for you.",
        "Oh, you're the lucky one! There is coffee only for you!",
        "You will be the last one you who will have the coffee now. Enjoy."
    ]
    return arr[randomInteger(0, 2)]
}

function randomTextMax() {
    let arr = [
        "The maschine is full of coffee. You are the lucky devil.",
        "There is enough coffee for two person. May be you have a cup of coffee with you pretty colleague?2",
        "There is enough coffee for two person. Invite you friend to drink coffee with you. :)"
    ]
    return arr[randomInteger(0, 2)]
}
function randomTextZ() {
    return "There is no coffee. Suffer.";
}


function createDB() {

    MongoClient.connect('mongodb://localhost:27017/', function (err, client) {
        db = client.db("bot");

        if (err) {
            throw err;
        }

        // db.collection('machine').find().toArray(function(err, result) {
        //     if (err) {
        //         throw err;
        //     }
        //     console.log(result);
        // });

        console.log("Log utils.js");
        //console.log("db.collection('machine').find().count()", db.collection('machine').find().count())
        //console.log("db.collection('dayLog').find().count()", db.collection('dayLog').find().count())

        db.dropCollection('machine');
        db.dropCollection('dayLog');


        db.createCollection("machine");

        db.collection('machine').insertOne({
            machineID: 1,
            department: 'Development',
            description: '2nd floor, to the left of the door'
        });
        db.collection('machine').insertOne({
            machineID: 2,
            department: 'Designer',
            description: '1nd floor, in the hallway'
        });

        db.createCollection("dayLog");
        db.collection('dayLog').insertOne({
            machineID: 1,
            value: 50,
            time: new Date()
        });
        db.collection('dayLog').insertOne({
            machineID: 2,
            value: 30,
            time: new Date()
        });
        db.dropCollection("users");
        db.createCollection("users");
        console.log("Data add :)");
        /*db.collection('machine').find().toArray(function (err, items) {
            console.log('test')
            console.log(items);
            // res.send(items);
        })*/

    });
}

function addUserToBase(id, name, surname, departament) {
    db.collection('users').insertOne({
        name: name,
        surname: surname,
        userId: id,
        departament: departament,
        machine1: 1,
        machine2: 2
    });
    return null;
}

function addFriend(useId, friendId) {
    user = db.collection('users').findOne({userId: userId})
    user.friends.insert({friend: friendId})
    return null;
}

function getFact(number) {
    switch (randomInteger(1, 1)) {
        case 1:
            return getFactGet(number, "math");
            break;
        case 2:
            return getFactGet(number, "trivia");
            break;
        case 3:
            return getFactGet(number, "date");
            break;
        case 4:
            return getFactGet(number, "year");
            break;
    }
}

function getFactGet(number, type) {
    return request('GET', 'http://numbersapi.com/' + number + '/' + type).getBody('utf8');
}

module.exports.createDB = createDB;
module.exports.getFact = getFact;
module.exports.addUserToBase = addUserToBase;
module.exports.addFriend = addFriend;
module.exports.randomTextMin = randomTextMin;
module.exports.randomTextMax = randomTextMax;
module.exports.randomTextZ = randomTextZ;