var util = require('util');
var SerialPort = require('serialport').SerialPort;
var xbee_api = require('xbee-api');
var pubnub = require('pubnub').init({
    publish_key : "pub-c-10a63f9f-359c-472b-a6ba-d55766a60e69",
    subscribe_key : "sub-c-9c92c072-698f-11e4-97dd-02ee2ddab7fe"
})

var C = xbee_api.constants;

var xbeeAPI = new xbee_api.XBeeAPI({
      api_mode: 2
});

var serialport = new SerialPort("/dev/ttyUSB0", {
      baudrate: 9600,
      parser: xbeeAPI.rawParser()
});


serialport.on("open", function() {
    queryNetwork();
});
var network = {};
// All frames parsed by the XBee will be emitted here
xbeeAPI.on("frame_object", function(frame) {
    var type = frame["type"];
    console.log("Type: ", frame["type"]);
    if (type == 0x97) {
        console.log("Address:",frame["remote16"]+' '+frame["remote64"]);
        network[frame["remote16"]] = frame["remote64"];
        pubnub.publish({
            channel: 'network_def',
            message: network
        })
    }
    else if (type == 0x90) {
        var payload = createHexString(frame["data"]);
        var node    = String(frame["remote16"]);
        console.log("sensor:",node);
        console.log("says",payload);

        // outbound stream
        pubnub.publish({
            channel: 'outbound',
            message: {
                node:    node,
                payload: payload
            }
        });

        // node specific stream (good for node-red)
        pubnub.publish({
            channel: 'node-' + node,
            message: payload
        });
    }
});

var send_to_zbee = function(node, payload) {
    console.log("Sending", payload + " to " + node);
    if (network[node]) {
        var message = {
                    type: 0x10, // xbee_api.constants.FRAME_TYPE.ZIGBEE_TRANSMIT_REQUEST
                    id: 0x01, // optional, nextFrameId() is called per default
                    destination64:network[node],
                    destination16:node,
                    broadcastRadius: 0x00, // optional, 0x00 is default
                    options: 0x00, // optional, 0x00 is default
                    data: payload // Can either be string or byte array.
        }
        serialport.write(xbeeAPI.buildFrame(message));
    }

}
pubnub.subscribe({
        channel  : "inbound",
        callback : function(message) {
            var node    = message.node,
                payload = message.payload,
                action  = message.action;
            
            if (node && payload !== undefined) {
                send_to_zbee(node, payload);
            }
            else if(message.action == 'network_status'){
                pubnub.publish({
                    channel: 'network_def',
                    message: network
                })
            }
        }
});
function queryNetwork() {
    // Something we might want to send to an XBee...
    var frame_obj = {
      type: 0x17,
      command: "NI",
      commandParameter: [],
    };
    serialport.write(xbeeAPI.buildFrame(frame_obj));
    setTimeout(queryNetwork, 60000);
}

function createHexString(array) {
    var s = '';
    var answer = array.map(function (x) {
        var ashex = x.toString(16);
        ashex = ("00" + ashex).substr(-2);
        return ashex
    }).join('');
    return answer;
}
    
