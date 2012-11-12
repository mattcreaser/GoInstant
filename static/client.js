var socket = io.connect();

// Page load handler
$(document).ready(function() {
    $('#setNickname').click(joinGame);
});

// Handler for when the player clicks the 'play' button.
function joinGame () {
    // Tell the server that the entered player name is joining.
    var nickname = $('#nickname').val();
    socket.emit('join', { name: nickname });
    $('#signin').hide();
}

// Handle the setPlayerList message. This message is sent whenever a player
// leaves or joins, or when the scores are updated.
socket.on('setPlayerList', function (players) {
    // Clear the current list of players.
    $('#players').empty();
    
    // Loop over the players and add each to the overall score box.
    for (var i = 0; i < players.length; ++i) {
        var player = players[i];
        $('<li/>').text(player.name + ': ' + player.score)
                  .appendTo($('#players'));
    }
    
    // Determine if the waiting message should be shown or hidden.
    if (!$('#signin').is(':visible')) {
        if (players.length < 2) {
            $('#waiting').show();
            $('#game').hide();
        } else {
            $('#waiting').hide();
            $('#game').show();
        }
    }
});

// Handle the startRound message.
socket.on('startRound', function (word) {
    // Display the word.
    $('#word').text(word);
    
    // Add a keyup handler to check if the player typed the word correctly.
    $('#wordInput').val('').focus().keyup(function () {
        var guess = $(this).val();
        
        // Check if the word is typed correctly, ignoring case.
        if (guess.toLowerCase() == word.toLowerCase()) {
            // Stop the timer.
            timer.stop(); 
            
            // Remove the keyup event so that the word is not checked again.
            $(this).unbind('keyup');
            
            // Tell the server that the word was typed.
            socket.emit('wordDone', timer.getValue());
        }
    });
    
    // Start running the timer.
    timer.start();
});

// Handle the endRound message.
socket.on('endRound', function (data) {
    // Stop the timer.
    timer.stop();
    
    // Clear out the previous lastRound results.
    $('#lastRound').empty();
    $('#lastWord').text(data.word);
    
    // Update the lastRound results with the content of the message.
    for (var i in data.scores) {
        $('<li/>').text(data.scores[i].player.name + ': ' + data.scores[i].time)
                  .appendTo($('#lastRound'));
    }
});

// Handle the highScores message.
socket.on('highScores', function (data) {
    // Clear out the previous highScores list.
    $('#highScores').empty();
    $('#highScoreWord').text(data.word);
    
    // Update the highScores list with the content of the message.
    for (var i in data.scores) {
        $('<li/>').text(data.scores[i].name + ': ' + data.scores[i].time)
                  .appendTo($('#highScores'));
    }
});

//-----------------------------------------------------------------
// Timer object. This object times the user's input and updates the
// on-screen timer value.
var timer = {
    // Starts the timer.
    start: function () {
        // Save the start time for the timer.
        this.startTime = new Date();
        
        // Start updating the displayed value at 100 ms intervals.
        this.interval = setInterval(function () {
            timer.update();
        }, 100);
    },

    // Stops the timer.
    stop: function () {
        if (this.interval) {
            // Stop updating the value.
            clearInterval(this.interval);
            this.interval = null;
            
            // Run the update function once more so that the final value
            // is precise to the stop call instead of simply the most
            // recent timer interval.
            this.update();
        }
    },
    
    // Updates the currentTime and the displayed time.
    update: function () {
        this.currentTime = new Date();
        $('#timer').text(this.getValue());
    },
    
    // Returns a Date object that represents the interval between
    // start and stop calls.
    getValue: function () {
        return (this.currentTime - this.startTime) / 1000;
    }
};
