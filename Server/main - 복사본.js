"use strict";

// Requires
var cluster = require('cluster');
var Colors = require('colors');
var split = require('string-split');
var fs = require('fs');
var async = require('async');
var functions = require('./classes/functions.js').create();
var server = require('./classes/server.js').createServer();
var uuid_v4 = require('uuid-v4');
var os = require('os');
var database = require('./classes/database');
const Player = require('./classes/game').Player;
const Game = require('./classes/game').Game;
const Team = require('./classes/game').Team;

// 서버 세부 설정
var debug_mode = 1; // 1 is on, 0 is off
var tcp_port = 20000; //TCP port
if (debug_mode == 1)
    var ip = '127.0.0.1'; //IP address
else
    var ip = '172.16.113.102';
var worker_id  = 1;
var room = new Array();
var blue_gage = new Array();
var red_gage = new Array();
var room_max = 1;
var game_max = 4;
for (var i = 0; i < room_max; i++) {
    room[i] = "";
    blue_gage[i] = 0;
    red_gage[i] = 0;
}
var Games = new Array(room_max);

//워커 스케쥴을 Round Robin 방식으로 한다.
cluster.schedulingPolicy = cluster.SCHED_RR;

// 시그널 설정
const signal_ping = 0;
const signal_login = 1;
const signal_search = 2;
const signal_move = 3;
const signal_handoff = 4;
const signal_instance = 5;
const signal_myinfo = 6;
const signal_hp = 7;
const signal_restart = 8;
const signal_register = 9;
const signal_endgame = 10;
const signal_kill_log = 11;

function handoff(worker,uuid,x,y,type,team){
    worker.send({
        to: 'worker', type: 'handoff',
        uuid: uuid,
        x: x,
        y: y,
        _type: type,
        team: team
    });  
};
function find_room(target_room,f) {
    for (i = 0; i < room_max; i++) {
        if (room[i] == target_room) {
            f();
        }
    }
}

// 서버의 모든 관리는 이 프로세서를 거쳐야합니다 !
if (cluster.isMaster) {
    // Requires
    var User = require('./classes/user.js');
    var UserBox = require('./classes/user_box.js');

    // 변수 설정
    var authenticated_users = UserBox.create();

    // 큐
    class Queue {
        constructor() {
            this._arr = [];
        }
        enqueue(item) {
            this._arr.push(item);
        }
        dequeue() {
            return this._arr.shift();
        }
        length() {
            return this._arr.length;
        }
        destroy(message) {
            if (this._arr.indexOf(message) != -1) {
                this._arr.splice(this._arr.indexOf(message), 1);
            }
        }
    }
    const match_wait = new Queue();
    

    // 워커 생성
    var tasks = [
        function (callback) {
            console.log("- - - - - - - - - - - - - ".inverse);
            console.log("- 워커들을 생성합니다.".white);
            os.cpus().forEach(function (cpu) {
                cluster.fork(); // 스레드만큼 생성
            });
            callback(null, "Worker forked!");
        }
    ]; async.series(tasks, function (err, results) { });

    // 워커는 죽지 못해요. 신안 노예랍니다.
    cluster.on('exit', function (worker, code, signal) {
        console.log("- 워커 ".red + worker.process.pid + "가 죽었습니다 - 사망원인 | ".red + code);
        var new_worker = cluster.fork();
        new_worker.send({ to: 'worker', type: 'start', port: tcp_port, id: worker_id });
        worker_id++;
    });

    // 일 시작이다 노예들아!
    for (var id in cluster.workers) {
        cluster.workers[id].send({ to: 'worker', type: 'start', port: tcp_port, id: worker_id });
        worker_id++;
    }

    // 워커들과의 파이프 통신
    cluster.on('message', async function (worker, message) {
        try {
            if ((message.to == 'master') || (message.to == 'all')) {
                switch (message.type) {
                    case 'register':
                        var check = 1;
                        authenticated_users.each(function (user) {
                            if (user.id == message.id) {
                                check = -1;
                            }
                        });

                        if (check == 1) {
                            await database.register(message.id, message.pass, message.nickname)
                                .then(result => {
                                    if (result) {
                                        worker.send({ to: 'worker', type: 'register', msg: 1, uuid: message.uuid });
                                    }
                                    else {
                                        worker.send({ to: 'worker', type: 'register', msg: 0, uuid: message.uuid });
                                    }
                                });
                        }
                        break;

                    case 'login':
                        var check = 1;
                        authenticated_users.each(async function (user) {
                            // 기존에 데이터가 있는 유저!
                            if (user.id == message.id) {
                                check = -1;
                                if (user.uuid == -1) {
                                    // 받은 id에 매칭되는 pass인지 확인합니다.
                                    await database.login(message.id,message.pass)
                                    .then(result=>{
                                        if(result.exist){
                                            worker.send({ to: 'worker', type: 'login', msg: 2, uuid: message.uuid, nickname: result.name });
                                            user.uuid = message.uuid;
                                            user.nickname = result.name;
                                            var check_ = true;
                                            find_room(user.room,()=>{
                                                check_ = false;
                                                console.log("   " + user.id + " 가 ".gray + user.room + " 으로 핸드오프".gray);
                                                handoff(worker,message.uuid,user.x,user.y,user._type,user.team);
                                            });
                                            if (check_) {
                                                user.room = "null";
                                                user.room_i = -1;
                                            }
                                        }
                                        else {
                                            worker.send({ to: 'worker', type: 'login', msg: 0, uuid: message.uuid });
                                        }
                                    });
                                } else {
                                    worker.send({ to: 'worker', type: 'login', msg: 0, uuid: message.uuid });
                                }
                            }
                        });

                        if (check == 1) {
                            // 새로 들어온 유저!
                            await database.login(message.id,message.pass)
                                .then(result=>{
                                    if(result.exist){
                                        worker.send({ to: 'worker', type: 'login', msg: 1, uuid: message.uuid, nickname: result.name });
                                        var new_user = User.create(message.uuid, message.id);
                                        authenticated_users.addUser(new_user);
                                        new_user.nickname = result.name;
                                    }else{
                                        worker.send({ to: 'worker', type: 'login', msg: 0, uuid: message.uuid });
                                    }
                                });
                        }
                        break;

                    case 'logout':
                        authenticated_users.each(function (user) {
                            if ((user.uuid == message.uuid) && (user.uuid != -1)) {
                                match_wait.destroy(user.uuid);
                                user.uuid = -1;
                            }
                        });
                        break;

                    case 'search':
                        if (message.id == 1) {
                            // 대기열 삽입
                            match_wait.enqueue(message.uuid);
                            console.log(match_wait._arr);
                        } else if (message.id == 2) {
                            // 대기열에서 삭제
                            match_wait.destroy(message.uuid);
                            console.log(match_wait._arr);
                        }
                        break;

                    case 'move':
                        var _id;
                        authenticated_users.each(function (user) {
                            if (user.uuid == message.uuid) {
                                _id = user.id;
                            }
                        });
                        var ins = authenticated_users.findUser(_id);
                        if (ins != undefined) {

                            ins.x = message.x;
                            ins.y = message.y;
                            ins.z = message.z;
                            ins._type = message._type;
                            ins.weapon_angle = message.weapon_angle;
                            ins.weapon_delay_i = message.weapon_delay_i;
                            ins.weapon_dir = message.weapon_dir;
                            ins.weapon_range = message.weapon_range;
                            ins.weapon_xdir = message.weapon_xdir;
                            ins.xdir = message.xdir;
                            ins.move = message.move;
                            ins.jump = message.jump;

                        } else {
                            console.log(authenticated_users.findUser(message.id));
                            console.log(message.id);
                        }
                        break;

                    case 'instance':
                        var _id;
                        authenticated_users.each(function (user) {
                            if (user.uuid == message.uuid) {
                                _id = user.id;
                            }
                        });
                        var ins = authenticated_users.findUser(_id);
                        authenticated_users.each(function (user) {
                            if ((ins.room == user.room) && (ins.id != user.id)) {
                                for (var id in cluster.workers) {
                                    cluster.workers[id].send({ type: 'instance', to: 'worker', msg: message.msg, uuid: user.uuid });
                                }
                            }
                        });
                        break;

                    case 'killLog':
                        var _id;
                        authenticated_users.each(function (user) {
                            if (user.uuid == message.uuid) {
                                _id = user.id;
                            }
                        });
                        var ins = authenticated_users.findUser(_id);
                        authenticated_users.each(function (user) {
                            if (ins.room == user.room) {
                                for (var id in cluster.workers) {
                                    cluster.workers[id].send({ type: 'killLog', to: 'worker', a: message.a, b: message.b, uuid: user.uuid });
                                }
                            }
                        });
                        break;

                    case 'hp':
                        var ins = authenticated_users.findUser(message.id);
                        ins.hp -= message.msg;
                        if (ins.hp > 100)
                            ins.hp = 100;
                        break;
                }
            }

            // 내가 받을 메세지가 아니니 에코
            if ((message.to == 'worker') || (message.to == 'all')) {
                for (var id in cluster.workers) {
                    cluster.workers[id].send(message);
                }
            }
        } catch (e) {
            console.log(e);
        }
    });
    
    // 큐 내용을 확인하고 1초에 한번씩 매칭, 아무도 없는 방이면 삭제
    !function input_match() {
        var i, temp_data, temp_room, check = -1, j;
        for (i = 0; i < room_max; i++) {
            var check = 1;
            authenticated_users.each(function (user) {
                if ((user.room == room[i]) && (user.uuid != -1)) {
                    check = -1;
                }
            });

            if (check == 1) {
                room[i] = "";
            }
        }

        if (match_wait.length() >= game_max) {
            for (i = 0; i < room_max; i++) {
                if (room[i] == "") {
                    temp_room = uuid_v4();
                    room[i] = temp_room;
                    red_gage[i] = 0;
                    blue_gage[i] = 0;
                    console.log(room[i]);
                    var team = "red";
                    var TeamRed = new Team(game_max/2,"red");
                    var TeamBlue = new Team(game_max/2,"blue");
                    for (j = 0; j < game_max; j++) {
                        temp_data = match_wait.dequeue();
                        authenticated_users.each(function (user) {
                            if (user.uuid == temp_data) {
                                user.hp = 100;
                                user.sp = 100;
                                user._type = -1;
                                var player = new Player(user.id,"test",user._type);

                                if (team == "red") {
                                    TeamBlue.AddPlayer(player);
                                    team = "blue";
                                    user.x = 762 + functions.getRandomInt(10, 30);
                                    user.y = 1408 + functions.getRandomInt(10, 30);
                                    user.respawn = -1;
                                    user.hp = 100;
                                }
                                else {
                                    TeamRed.AddPlayer(player);
                                    team = "red";
                                    user.x = 96 + functions.getRandomInt(10, 30);
                                    user.y = 1408 + functions.getRandomInt(10, 30);
                                    user.respawn = -1;
                                    user.hp = 100;
                                }

                                console.log(user.uuid);
                                user.room = temp_room;
                                user.team = team;
                                user.room_i = i;
                                console.log("- " + user.room);
                                for (var id in cluster.workers) {
                                    cluster.workers[id].send({ type: 'search', to: 'worker', uuid: user.uuid, id: 1, team: user.team, x: user.x, y: user.y });
                                }
                            }
                        });
                    }
                    var game = new Game(TeamRed,TeamBlue);
                    Games[i]=game;
                    break;
                }
            }
        }
       
        setTimeout(function () {
            input_match();
        }, 1000);
    }()

    // 무한 반복 시킬 내용
    !function step() {
        authenticated_users.each(function (user) {
            if (user.room != "null") {
                authenticated_users.each(function (to_user) {
                    if ((to_user.room == user.room) && (user.id != to_user.id) && (to_user.uuid != -1)) {
                        if ((user._type != -1)/*  && (Math.sqrt(Math.pow((user.x - to_user.x), 2) + Math.pow((user.y - to_user.y), 2)) < 250) 데이터 주고받기 최소화 */) {
                            for (var id in cluster.workers) {
                                cluster.workers[id].send({
                                    type: 'move', to: 'worker',
                                    id: user.id,
                                    user_id: to_user.uuid,
                                    x: user.x,
                                    y: user.y,
                                    z: user.z,
                                    _type: user._type,
                                    weapon_delay_i: user.weapon_delay_i,
                                    weapon_range: user.weapon_range,
                                    weapon_angle: user.weapon_angle,
                                    move: user.move,
                                    jump: user.jump,
                                    weapon_dir: user.weapon_dir,
                                    weapon_xdir: user.weapon_xdir,
                                    xdir: user.xdir,
                                    hp: user.hp,
                                    sp: user.sp,
                                    team: user.team,
                                    nickname: user.nickname,
                                    respawn: user.respawn
                                });
                            }
                        }

                    }
                });
            }

            if (user.respawn > -1) {
                user.respawn--;
            }
        });

        var i;
        // 게임 진행
        for (i = 0; i < room_max; i++) {
            //게이지 올리기
            var red_check = -1;
            var blue_check = -1;
            authenticated_users.each(function (user) {
                if ((user.room == room[i]) && (user.x > 330) && (user.x < 630) && (user.y > 210) && (user.y < 510)) {
                    if (user.team == "red") {
                        red_check = 1;
                    } else if (user.team == "blue") {
                        blue_check = 1;
                    }
                }
            });

            if (!((red_check == 1) && (blue_check == 1))) {
                if (red_check == 1) {
                    red_gage[i]++;
                }

                if (blue_check == 1) {
                    blue_gage[i]++;
                }

                authenticated_users.each(function (user) {
                    if (user.room == room[i]) {
                        user.engagement = -1;
                    }
                });
            } else { 
                authenticated_users.each(function (user) {
                    if (user.room == room[i]) {
                        user.engagement = 1;
                    }
                });
            }

            //게이지 확인
            if (red_gage[i] != blue_gage[i] && room[i]!="") {
                // 게이지 찬 값이 같으면 동점이니 계속 연장
                if (red_gage[i] > 1800) {
                    // user.team 이 "red" 이거나, "blue" 임
                    Games[i].RedTeam.EndGame(true);
                    Games[i].BlueTeam.EndGame(false);
                    // 빨강 승리
                    authenticated_users.each(function (user) {
                        if (user.room == room[i]) {
                            user.room = "null";
                            user.room_i = -1;

                            for (var id in cluster.workers) {
                                cluster.workers[id].send({ type: 'endgame', to: 'worker', uuid: user.uuid, team: "red"});
                            }
                        }
                    });

                    room[i] = "";
                    
                    red_gage[i] = 0;
                    blue_gage[i] = 0;

                }

                if (blue_gage[i] > 1800) {
                    Games[i].RedTeam.EndGame(false);
                    Games[i].BlueTeam.EndGame(true);
                    // 파랑 승리
                    authenticated_users.each(function (user) {
                        if (user.room == room[i]) {
                            user.room = "null";
                            user.room_i = -1;
                        }

                        for (var id in cluster.workers) {
                            cluster.workers[id].send({ type: 'endgame', to: 'worker', uuid: user.uuid, team: "blue" });
                        }
                    });

                    room[i] = "";
                    red_gage[i] = 0;
                    blue_gage[i] = 0;
                }
            }
        }


        authenticated_users.each(function (user) {
            for (i = 0; i < room_max; i++) {
                if (user.room == room[i]) {
                    if (user.hp <= 0) {
                        user.respawn = 60*20;
                        user.hp = 100;
                        if (user.team == "blue") {
                            user.x = 762 + functions.getRandomInt(10, 30);
                            user.y = 1408 + functions.getRandomInt(10, 30);
                        } else {
                            user.x = 96 + functions.getRandomInt(10, 30);
                            user.y = 1408 + functions.getRandomInt(10, 30);
                        }
                        if (user.uuid != -1) {
                            for (var id in cluster.workers) {
                                cluster.workers[id].send({ type: 'restart', to: 'worker', uuid: user.uuid, x: user.x, y: user.y });
                            }
                        }
                    }
                    if (user.uuid != -1) {
                        for (var id in cluster.workers) {
                            cluster.workers[id].send({
                                type: 'myinfo', to: 'worker',
                                uuid: user.uuid,
                                hp: user.hp,
                                sp: user.sp,
                                respawn: user.respawn,
                                red_gage: red_gage[user.room_i],
                                blue_gage: blue_gage[user.room_i],
                                engagement: user.engagement
                            });
                        }
                    }
                }
            }

        });

        setTimeout(function () {
            step();
        }, 20);
    }()
}

// 노동자 내용
if (cluster.isWorker) {
    // Requires
    var User_worker = require('./classes/user_worker.js');
    var UserBox_worker = require('./classes/user_box_worker.js');

    // 변수 설정
    var temp_buffer = "", buffer_string = "", buffer_reading_string = "", i = 0;
    authenticated_users = UserBox_worker.create();
    read_offset = 0;
    write_offset = 0;
    write_buffer = Buffer.allocUnsafe(1).fill(0);

    // 메세지 보내는 방법
    function send_id_message(sock, id, msg) {
        if (sock != -1) {
            var json_string = JSON.stringify({
                id: id,
                msg: msg
            });
            sock.send("㏆" + json_string.length + "®" + json_string);
        }
    }

    // 파이프 통신
    process.on('message', function (message) {
        if (message.to == 'worker') {
            switch (message.type) {

                case 'start':
                    server.listen(message.port, ip);
                    worker_id = message.id;
                    break;

                case 'login':
                    var temp_nickname = "null";
                    if (message.nickname != undefined)
                        temp_nickname = message.nickname;
                    authenticated_users.each(function (user) {
                        if (user.uuid == message.uuid) {
                            var json_data = JSON.stringify({
                                msg: message.msg,
                                uuid: user.uuid,
                                nickname: temp_nickname
                            });
                            send_id_message(user.socket, signal_login, json_data);
                        }
                    });
                    break;

                case 'register':
                    authenticated_users.each(function (user) {
                        if (user.uuid == message.uuid) {
                            var json_data = JSON.stringify({
                                msg: message.msg,
                                uuid: user.uuid
                            });
                            send_id_message(user.socket, signal_register, json_data);
                        }
                    });
                    break;

                case 'endgame':
                    authenticated_users.each(function (user) {
                        if (user.uuid == message.uuid) {
                            send_id_message(user.socket, signal_endgame, message.team);
                        }
                    });
                    break;

                case 'search':
                    if (message.id == 1) {
                        authenticated_users.each(function (user) {
                            if (user.uuid == message.uuid) {
                                var json_data = JSON.stringify({
                                    id: 1,
                                    team: message.team,
                                    x: message.x,
                                    y: message.y
                                });
                                send_id_message(user.socket, signal_search, json_data);
                            }
                        });
                    }
                    break;

                case 'move':
                    var ins = authenticated_users.findUser(message.user_id);
                    if (ins != undefined) {
                        var json_data = JSON.stringify({
                            id: message.id,
                            type: message._type,
                            x: parseInt(message.x),
                            y: parseInt(message.y),
                            z: parseInt(message.z),
                            weapon_delay_i: parseInt(message.weapon_delay_i),
                            weapon_range: parseInt(message.weapon_range),
                            weapon_angle: parseInt(message.weapon_angle),
                            move: message.move,
                            jump: message.jump,
                            weapon_dir: parseInt(message.weapon_dir),
                            weapon_xdir: message.weapon_xdir,
                            xdir: message.xdir,
                            hp: message.hp,
                            sp: message.sp,
                            team: message.team,
                            nickname: message.nickname,
                            respawn: message.respawn
                        });

                        send_id_message(ins.socket, signal_move, json_data);
                    }
                    break;

                case 'handoff':
                    var ins = authenticated_users.findUser(message.uuid);
                    if (ins != undefined) {
                        var json_data = JSON.stringify({
                            type: message._type,
                            x: message.x,
                            y: message.y,
                            team: message.team
                        });
                        send_id_message(ins.socket, signal_handoff, json_data);
                    }
                    break;

                case 'instance':
                    var ins = authenticated_users.findUser(message.uuid);
                    if (ins != undefined) {
                        send_id_message(ins.socket, signal_instance, message.msg);
                    }
                    break;

                case 'killLog':
                    var ins = authenticated_users.findUser(message.uuid);
                    if (ins != undefined) {
                        var json_data = JSON.stringify({
                            a: message.a,
                            b: message.b
                        });
                        send_id_message(ins.socket, signal_kill_log, json_data);
                    }
                    break;

                case 'myinfo':
                    var ins = authenticated_users.findUser(message.uuid);
                    if (ins != undefined) {
                        var json_data = JSON.stringify({
                            hp: message.hp,
                            sp: message.sp,
                            red_gage: message.red_gage,
                            blue_gage: message.blue_gage,
                            respawn: message.respawn,
                            engagement: message.engagement
                        });
                        send_id_message(ins.socket, signal_myinfo, json_data);
                    }
                    break;

                case 'restart':
                    var ins = authenticated_users.findUser(message.uuid);
                    if (ins != undefined) {
                        var json_data = JSON.stringify({
                            x: message.x,
                            y: message.y
                        });
                        send_id_message(ins.socket, signal_restart, json_data);
                    }
                    break;

                default:
                    break;
            }
        }
    });

    server.onConnection(function (dsocket) {
        dsocket.onMessage(function (data) {
            try {
                buffer_string = data.toString();
                buffer_reading_string = temp_buffer + buffer_reading_string;
                temp_buffer = "";

                for (i = 0; i < buffer_string.length; i++) {
                    if (buffer_string.charAt(i) != "#") {
                        buffer_reading_string += buffer_string.charAt(i);
                        if (buffer_string.length - 1 == i) {
                            temp_buffer += buffer_reading_string;
                        }
                    }

                    if (buffer_string.charAt(i) == "#") {
                        try {
                            var json_data = JSON.parse(buffer_reading_string);
                        } catch (e) {
                            temp_buffer = "";
                            buffer_reading_string = "";
                            break;
                        }
                        var id = json_data.id;
                        var msg = json_data.msg;
                        var ins = authenticated_users.findUserBySocket(dsocket);

                        // 클라이언트 세부 메세지 처리
                        switch (id) {
                            case signal_ping:
                                send_id_message(dsocket, signal_ping, msg);
                                break;

                            case signal_login:
                                if (authenticated_users.findUserBySocket(dsocket) == null) {
                                    var new_user = User_worker.create(0, dsocket);
                                    authenticated_users.addUser(new_user);
                                    process.send({ type: 'login', to: 'master', uuid: new_user.uuid, id: msg, pass: json_data.pass });
                                    console.log("   pid ".gray + process.pid + " 에서 ".gray + msg + "로 로그인 시도".gray);
                                } else {
                                    process.send({ type: 'login', to: 'master', uuid: authenticated_users.findUserBySocket(dsocket).uuid, id: msg, pass: json_data.pass });
                                    console.log("   pid ".gray + process.pid + " 에서 ".gray + msg + "로 로그인 시도".gray);
                                }
                                break;

                            case signal_register:
                                if (authenticated_users.findUserBySocket(dsocket) == null) {
                                    var new_user = User_worker.create(0, dsocket);
                                    authenticated_users.addUser(new_user);
                                    process.send({ type: 'register', to: 'master', uuid: new_user.uuid, id: msg, pass: json_data.pass, nickname: json_data.nickname });
                                } else {
                                    process.send({ type: 'register', to: 'master', uuid: authenticated_users.findUserBySocket(dsocket).uuid, id: msg, pass: json_data.pass, nickname: json_data.nickname });
                                }
                                break;

                            case signal_search:
                                process.send({ type: 'search', to: 'master', uuid: ins.uuid, id: msg });
                                break;

                            case signal_move:
                                process.send({
                                    type: 'move', to: 'master',
                                    uuid: json_data.uuid,
                                    x: json_data.x,
                                    y: json_data.y,
                                    z: json_data.z,
                                    _type: json_data.type,
                                    weapon_delay_i: json_data.weapon_delay_i,
                                    weapon_range: json_data.weapon_range,
                                    weapon_angle: json_data.weapon_angle,
                                    move: json_data.move,
                                    jump: json_data.jump,
                                    weapon_dir: json_data.weapon_dir,
                                    weapon_xdir: json_data.weapon_xdir,
                                    xdir: json_data.xdir
                                });
                                break;

                            case signal_instance:
                                process.send({ type: 'instance', to: 'master', msg: buffer_reading_string, uuid: ins.uuid });
                                break;

                            case signal_hp:
                                process.send({ type: 'hp', to: 'master', msg: msg, id: json_data.who });
                                break;

                            case signal_kill_log:
                                process.send({ type: 'killLog', to: 'master', a: json_data.a, b: json_data.b, uuid: ins.uuid });
                                break;

                            default:
                                console.log(id);
                                break;
                        }

                        buffer_reading_string = "";
                    }

                }
            } catch (e) {
                temp_buffer = "";
                buffer_reading_string = "";
                console.log("- pid ".red + process.pid + "에서 에러 발생 | ".red + e);
            }
        });
        // 클라이언트와의 연결이 끊겼을때
        dsocket.onClose(function () {
            var quitter;
            if ((quitter = authenticated_users.findUserBySocket(dsocket)) != null) {
                console.log("- 유저 나감 (".gray + (quitter.uuid).gray + ")".gray);
                process.send({ type: 'logout', to: 'master', uuid: quitter.uuid });
                authenticated_users.removeUserData(quitter.uuid);
            }
        });
    });
}