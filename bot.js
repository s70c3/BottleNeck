/* --------------------------------------------------------------------- */
/* ----------------------------- Константы ----------------------------- */
/* --------------------------------------------------------------------- */

const SERVICE_TOKEN = "e3c24d49e3c24d49e3c24d49f3e3a41d4fee3c2e3c24d49b86f6cdde0b8edbc69a79c41";
const GROUP_TOKEN = "e355c0863735f9bdf5be4353ffaaf013a48f0706aef81a320b29b980159d59fd61e27d29e641d8221c553";
const DEGUB_MESSAGES_TOKEN = "40b133b5de3e2321f93157174d10bb6544247a034727e8500d7a1268212a981116f8feeeb6587f2e2ab64";
const CONFIRMATION_CODE = "ca70e078";
const SECRET_CODE = "67f64e341440";
const GROUP_ID = 173738332;
// 172443930

/* --------------------------------------------------------------------- */
/* ------------------------------ Модули ------------------------------- */
/* --------------------------------------------------------------------- */

const http = require("http");
const querystring = require("querystring");
const {createDB, getFact, addUserToBase, addFriend, hasUser, randomTextMin, randomTextMax, randomTextZ} = require("./utils");
var MongoClient = require('mongodb').MongoClient;
const VKapi = new (require("./vk-api"))({
    token: GROUP_TOKEN
});

process.env.TZ = 'Europe/Moscow'

/* --------------------------------------------------------------------- */
/* ------------------------------ Утилиты ------------------------------ */
/* --------------------------------------------------------------------- */

String.prototype.format = function (...args) {
    return this.replace(/{(\d+)}/g, (match, index) => args[index]).trim();
}


/**
 * Обрабатывает запрос
 */
function processBasicGetPostRequest(req, res, next) {
    let method = req.method;
    //createDB();

    // Вытаскиваем параметры запроса из URL
    req.query = querystring.parse(req.url.slice(req.url.indexOf("?") + 1));

    // Дополнительные методы response
    res.send = function (...args) {
        let statusCode = 200,
            contentType = "text/plain; charset=utf-8",
            responseEnd = "";

        if (args.length === 1) {
            responseEnd = args[0]
        } else {
            [statusCode, responseEnd] = args;
        }

        if (typeof responseEnd === "object") {
            try {
                responseEnd = JSON.stringify(responseEnd);
                contentType = "application/json";
            } catch (e) {
            }
        }

        res.writeHead(statusCode, {"Content-Type": contentType});
        res.end(`${responseEnd}`, "utf8");
    }

    // Обычный GET запрос
    if (method === "GET") {
        req.form = req.query;
        return next(req, res);
    }

    // Обычный POST запрос, собираем поступающее тело и как строку записываем в req.body
    if (method === "POST") {
        let postBody = "";
        req.on("data", chunk => postBody += chunk.toString());

        req.on("end", () => {
            try {
                req.form = JSON.parse(postBody);
            } catch (e) {
            }

            req.body = postBody;
            next(req, res);
        });

        return;
    }

    // Другие методы выбросим в ошибку
    res.send(501, "Not Implemented");
}

/**
 * Разбивает массив на массив массивов, длина которых не превышает max
 * @param {Array} target Исходный массив
 * @param {number} max Максимальная длина результирующих массивов
 */
function chunkifyArray(target, max) {
    if (!target) return [];
    return target.reduce((memo, value, index) => {
        if (index % max == 0 && index !== 0) memo.push([])
        memo[memo.length - 1].push(value)
        return memo;
    }, [[]]);
}


/* --------------------------------------------------------------------- */
/* ---------------------- Обработка команд к боту ---------------------- */
/* --------------------------------------------------------------------- */

const stages = {
    1: "start"
}

async function coffeeBotListener(req, res) {


    let form = req.form || req.query;
    if (!form) return res.send("Error.");

    // Проверка сервера и защита от несанкц. доступа
    if (form.secret !== SECRET_CODE) return res.send("Error.");
    if (form.group_id !== GROUP_ID) return res.send("Error.");
    if (form.type === "confirmation") return res.send(CONFIRMATION_CODE);
    res.send("ok");

    // Если это не входящее сообщение боту, выходим
    if (form.type !== "message_new" || !form.object) return;

    // Параметры сообщения
    let obj = form.object || {},
        payload = {},
        fromId = obj.from_id,
        text = obj.text;

    let userInfo = (await getUsers([fromId]))[fromId];
    if (!userInfo) return sendDebugMessage("Нет userInfo о текущем пользователе");


    try {
        payload = JSON.parse(obj.payload || "{}");
    } catch (e) {
    }

    let cmd = payload.command;

    // Запишем возможные текстовые команды, как если бы это были кнопки
    if (/start|hello|hi/gi.test(text)) cmd = "start";
    if (/\d/gi.test(text)) cmd = "choose friend";


    //if (//gi.test(text)) cmd = "find_user";

    if (cmd === "choose friend") {

        num = parseInt(text)
        db.collection('users').find().toArray(function (err, items) {
            name = items[num - 1].name
            id = items[num - 1].userId
            let message = `${name} you are invited to drink a cofee by [id${userInfo.id}|${userInfo.name} ${userInfo.surname}]`;
            m1 = 'Invitation to ' + name + ' sent.'
            sendMessage(fromId, m1,
                [{
                    text: "Home",
                    type: "primary",
                    payload: {command: "start"}
                }]
                );

            return sendMessage(id, message, [
                {
                    text: "I'm coming",
                    type: "primary",
                    payload: {command: "friend_agree", id: fromId},
                    color: "positive"
                },
                {
                    text: "Later",
                    type: "primary",
                    payload: {command: "friend_later", id: fromId},
                    color: "negative"
                },
                {
                    text: "I can't",
                    type: "primary",
                    payload: {command: "friend_cant", id: fromId}
                },

                    {
                        text: "Home",
                        type: "primary",
                        payload: {command: "start", id: fromId},
                        color: "positive"
                    }


            ]);

        });
    }

    else if (cmd === "friend_agree") {
        id = payload.id
        message = `${userInfo.name} agreed`
        return sendMessage(id, message,
            [
                {
                    text: "Home",
                    type: "primary",
                    payload: {command: "start"}
                }
            ]
        )
    }
    if (cmd === "friend_later") {
        id = payload.id
        message = `${userInfo.name}  asked to come later`
        return sendMessage(id, message,
            [
                {
                    text: "Home",
                    type: "primary",
                    payload: {command: "start"}
                }
            ]
        )
    }

    if (cmd === "friend_cant") {
        id = payload.id
        message = `${userInfo.name}  doesn\'t want`
        return sendMessage(id, message,
            [
                {
                    text: "Home",
                    type: "primary",
                    payload: {command: "start"}
                }
            ]
        )
    }


    // Если текст равен "Начать" или есть payload с кнопки
    if (cmd === "start") {
        db.collection('users').findOne({userId: fromId}, function (err, document) {
            if (!document) addUserToBase(fromId, userInfo.name, userInfo.surname, 'testDep')
        });
        console.log(text)
        let message = `Hello, ` + userInfo.name + `! I am the bot that will help you to find a hot coffee. :).`;
        return sendMessage(fromId, message, [
                {
                    text: "I want coffee",
                    type: "primary",
                    payload: {command: "check_coffee"}
                },

                {
                    text: "Call a friend",
                    type: "primary",
                    payload: {command: "call_friend"}
                },
            {
                text: "Settings",
                type: "primary",
                payload: {command: "settings_coffee"}
            }

            ]
        );
    }



    if (cmd === "check_coffee") {
        let machine1;
        let machine2;
        let machineID1;
        let recommendation1;
        let recommendation2;

        db.collection('users').findOne({userId: fromId}, (err, data) => {
            machine1 = data.machine1;
            machine2 = data.machine2;

            db.collection('dayLog').findOne({machineID: machine1}, function (err, data) {
                machineID1 = data;

                db.collection('dayLog').findOne({machineID: machine2}, function (err, data) {
                    machineID2 = data;

                  //  console.log("machineID1: ", machineID1);
                    // console.log("machineID2: ", machineID2);

                    if (machineID1.value < 50 && machineID1.value !== 0) recommendation1 = randomTextMin();
                    else if (machineID1.value === 0) recommendation1 = randomTextZ();
                    else recommendation1 = randomTextMax();

                    if (machineID2.value < 50 && machineID2.value !== 0) recommendation2 = randomTextMin();
                    else if (machineID2.value === 0) recommendation2 = randomTextZ();
                    else recommendation2 = randomTextMax();

                    let message = `Information on the status of coffee machines:

                    ****machine 1:
                    value: ${machineID1.value}
                    time: ${machineID1.time.getHours()}:${machineID1.time.getMinutes()}:${machineID1.time.getSeconds()}
                    recommendation: ${recommendation1}
        
                    ****machine 2:
                    value: ${machineID2.value}
                    time: ${machineID2.time.getHours()}:${machineID2.time.getMinutes()}:${machineID2.time.getSeconds()}
                    recommendation: ${recommendation2}
        
                    ` + getFact(machineID2.value);

                    sendMessage(fromId, message, [
                        {
                            text: "Call a friend",
                            type: "primary",
                            payload: {command: "call_friend"}
                        },
                        {
                            text: "Settings",
                            type: "primary",
                            payload: {command: "settings_coffee"}
                        },
                        {
                            text: "Home",
                            type: "primary",
                            payload: {command: "start"}
                        },
                    ]);

                });
            });
        })
    };

    if (cmd === "settings_coffee") {
        console.log('settings')
        let message = 'Choose the one most usable machine for you';
        console.log(2)
        sendMessage(fromId, message, [
                {
                    text: "machine1",
                    type: "primary",
                    payload: {command: "setm", number:1}
                },
                {
                    text: "machine2",
                    type: "primary",
                    payload: {command: "setm", number:2}
                },
                {
                    text: "machine3",
                    type: "primary",
                    payload: {command: "setm", number:3}
                },
                {
                    text: "machine4",
                    type: "primary",
                    payload: {command: "setm", number:4}
                },
                {
                    text: "machine4",
                    type: "primary",
                    payload: {command: "setm", number:5}
                }
            ]
        );
    }


    // if (cmd = "setm") {
    //     db.collection('users').updateOne({userId: fromId}, (err, data) => {
    //         $set: {machine1: payload.number}
    //         return sendMessage(fromId, message, [
    //                 {
    //                     text: "Home",
    //                     type: "primary",
    //                     payload: {command: "start"}
    //                 }]);
    //
    //     })
    //
    // }


    //Позвать друга
    if (cmd === "call_friend") {
        //console.log("Здесь долэен быть запрос к  :)")
        let message = `List of employees:`;
        db.collection('users').find().toArray(function (err, items) {

            var m = "\n"
            for (var i = 0; i < items.length; i++) {
                m += i + 1
                m += " "
                m += items[i].name
                m += " "
                m += items[i].surname
                m += "\n"

            }
            return sendMessage(fromId, message + " " + m, [
                {
                    text: "Home",
                    type: "primary",
                    payload: {command: "start"}
                },
                {
                    text: "Send",
                    type: "primary",
                    payload: {command: "send"}
                },
            ]);
        })
    }

    //Выбор кофеварок
    if (cmd === "settings_coffee") {
        let message = `Выберите, что вы хотите настроить. :)`;
        return sendMessage(fromId, message, [
            {
                text: "Home",
                type: "primary",
                payload: {command: "start"}
            },
            {
                text: "CofeeMachines",
                type: "primary",
                payload: {command: "set_cm"}
            }
        ]);
    }
}

/**

 sendMessage(peerId, text, [
 {
			text: "Найти собеседника по интересам",
			type: "primary",
			payload: { command: "find_user" }
		}
 ]);

 */

function sendMessage(peerId, text, keyboardButtons) {
    let apiOpts = {
        peer_id: peerId,
        message: text
    };

    if (keyboardButtons) {
        keyboardButtons = keyboardButtons.map((obj) => {
            return {
                action: {
                    type: "text",
                    payload: JSON.stringify(obj.payload || {button: "unknown"}),
                    label: obj.text
                },
                color: obj.type || "default"
            }
        });

        apiOpts.keyboard = `{"one_time":false,"buttons":[${ JSON.stringify(keyboardButtons) }]}`
    } else {
        apiOpts.keyboard = `{"buttons":[],"one_time":true}`;
    }

    VKapi.call("messages.send", apiOpts);
}


/**
 *
 * @param {Array<Number>} userIds Массив идентификаторов пользователей
 */

function getUsers(userIds) {
    return new Promise((resolve, reject) => {
        userIds = chunkifyArray(userIds, 1000);

        Promise.all(userIds.map((ids) => VKapi.call("users.get", {
            user_ids: ids.join(","),
            fields: "sex,first_name_ins,last_name_ins,first_name_acc,last_name_acc"
        }))).then(
            r => {
                let users = {};

                r.forEach((rInner) => {
                    rInner.forEach((u) => {
                        users[u.id] = {
                            id: u.id,
                            name: `${u.first_name}`,
                            surname: `${u.last_name}`,
                            sex: u.sex === 1 ? "female" : "male",
                        }
                    });
                });

                resolve(users);
            }
        ).catch(e => reject(e));
    });
}


/* --------------------------------------------------------------------- */
/* -------------------------- Запуск сервера --------------------------- */
/* --------------------------------------------------------------------- */


MongoClient.connect('mongodb://localhost:27017/', function (err, client) {
    db = client.db("bot");

    if (err) {
        throw err;
    }
});

http.createServer((req, res) => {

    try {
        processBasicGetPostRequest(req, res, coffeeBotListener)
    } catch (e) {
        console.error(e);
    }
}).listen(8081, "localhost");

console.log("Start localhost:8081");