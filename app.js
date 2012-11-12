var fs = require('fs');
var path = require('path');

// :: -------------------------------------------------------------------------
// :: HTTP Server

var http = require('http').createServer(function (request, response) {
    // Build a path to the file based on the request URL. Serve app.html for
    // the index page.
    var filePath = (request.url == '/') ? '/static/app.html' : request.url;
    
    // Choose the appropriate content type based on file extension.
    var contentType = 'text/html';
    switch(path.extname(filePath)) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.gif': contentType = 'image/gif'; break;
    }
    
    // Load the HTML file from disk and write it to the HTTP response.
    fs.readFile(__dirname + filePath, function(error, data) {
        // Check if an error occurred during the file read.
        if (error) {
            // Send a 500 Internal Server Error response.
            response.writeHead(500);
            return response.end('Error reading file: ' + filePath);
        }
        
        // Set the status to 200 OK, and content-type to the appropriate value
        // for the file.
        response.writeHead(200, { 'Content-Type': contentType });
        
        // Write out the file contents.
        response.end(data);
    });
});

// Listen for http connections on port 80.
http.listen(80);

// :: -------------------------------------------------------------------------
// :: Socket Listener

var io = require('socket.io').listen(http);

// Setup the socket listeners.
io.sockets.on('connection', function (socket) {

    socket.on('join', function (data) {
        // Create a player object with the entered name.
        var player = players.add(data.name);
        console.log(data.name + ' joined the game.');
        
        // Associate the player object with the connected socket.
        socket.set('player', player);
        
        // Send an updated player list to all connected clients.
        io.sockets.emit('setPlayerList', players.list);
        
        // If there are now exactly two players then start a new round.
        if (players.list.length == 2)
        {
            round.start();
        }
    });

    // Handle client disconnection.
    socket.on('disconnect', function () {
        socket.get('player', function (error, player) {
            // If the client at this connection had already joined the game then
            // remove them from the player list and send the updated list to
            // all clients.
            if (player) {
                players.remove(player);
                io.sockets.emit('setPlayerList', players.list);
            }
        });
    });
    
    // Handle the wordDone message, which indicates that a player completed
    // typing a word.
    socket.on('wordDone', function (time) {
        // Get the player object associated with this socket and then score
        // the player.
        socket.get('player', function (error, player) {
            round.score(player, time);
        });
    });
});

// :: -------------------------------------------------------------------------
// :: Round Logic


var round = {
    
    start: function () {
        // Do not start the round unless there's at least two players.
        if (players.list.length <= 1) {
            return;
        }
        
        // Get the next word and send it to the clients.
        this.word = wordList.getNext();
        io.sockets.emit('startRound', this.word);
        
        // Set a maximum time of ten seconds on each round.
        this.timeout = setTimeout(function() { round.end(); }, 10000);
        
        // Reset the array of collected scores for this round.
        this.scores = [];
    },
    
    // Score the player with the given time for this round.
    score: function (player, time) {
        this.scores.push({ player: player, time: time });
        
        // End the round if all players have submitted a score.
        if (this.scores.length == players.list.length) {
            this.end();
        }
    },
    
    // End the current round.
    // Note: does not handle race conditions between round end times and 
    // wordDone messages.
    end: function () {
        clearTimeout(this.timeout);
        
        // Calculate the winner if at least one player finished.
        if (this.scores.length > 0) {
            // Sort the scores based on time.
            this.scores.sort(function(a, b) {
                return a.time - b.time;
            });
        
            // Add a point to the player with the lowest time.
            players.addPoint(this.scores[0].player);
            
            // Add the top player's score to the high scores table for this 
            // word.
            highScores.add(this.word, this.scores[0].player.name, 
                                      this.scores[0].time);
            
            // Send the updated scores.
            io.sockets.emit('setPlayerList', players.list);
        }

        // Send the round end message.
        io.sockets.emit('endRound', { word: this.word, scores: this.scores });
        
        // Pause 2.5 seconds, then start the next round.
        this.timeout = setTimeout(function() { round.start(); }, 2500);
    }
};

// :: -------------------------------------------------------------------------
// :: WordList Logic

var wordList = {

    // Load the wordlist.txt file from disk and parse its contents into an
    // array.
    load: function () {
        this.words = fs.readFileSync(__dirname + '/static/wordlist.txt')
                       .toString().split('\n');
    },

    // Return a random word from the list.
    getNext: function () {
        var i = Math.floor(Math.random() * this.words.length);
        return this.words[i].trim();
    }

};

// Load the wordlist from the file.
wordList.load();

// :: -------------------------------------------------------------------------
// :: PlayerList Logic

var players = {
    // Keep an array of all the players in the game.
    list: [],
    
    // Adds a new player with the supplied name.
    add: function (name) {
        this.list.push({ name: name, score: 0 });
        return this.list[this.list.length - 1];
    },
    
    // Removes the supplied player
    remove: function (player) {
        // Find the player in the list.
        for (var i = 0; i < this.list.length; ++i) {
            if (this.list[i] == player) {
                // Splice the player out of the list.
                this.list.splice(i, 1);
            }
        }
    },
    
    // Adds a single point to the supplied player.
    addPoint: function (player) {
        // Increment the score for the player.
        player.score++;
        
        // Resort the list based on the updated scores. The list should be
        // maintained in descending order.
        this.list.sort(function (a, b) {
            return b.score - a.score;
        });
    }    
};

// :: -------------------------------------------------------------------------
// :: All-Time High Scores Logic

// Use redis to persist the high scores.
var redis = require('redis').createClient();

var highScores = {
    
    // Adds a new score to the high scores list for the word.
    add: function (word, name, time) {
        redis.get(word, function(error, value) {
            // Default the current high score list for this word to an empty
            // array if it cannot be retrieved from the store.
            var scores = (value) ? JSON.parse(value) : [];
            
            // Add the new high score.
            scores.push({name: name, time: time});
            
            // Sort the updated array in ascending order (lowest time first).
            scores.sort(function(a, b) {
                return a.time - b.time;
            });
            
            // Limit the high score list to five entries for each word.
            if (scores.length > 5) {
                scores = scores.slice(0, 5);
            }
            
            // Store the updated array
            redis.set(word, JSON.stringify(scores));
            
            // Send the high scores to all clients.
            io.sockets.emit("highScores", { word: word, scores: scores});
        });
    }
};