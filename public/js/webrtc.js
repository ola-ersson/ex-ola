let Webrtc = (function () {
  const iceConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  let mySocketId = null;
  let localVideoPlayer = null;
  let serverFunction = null;
  let stopedScreenShareForRemote = null;
  let peerConnections = [];
  let peerConnectionIds = [];
  let remoteVideoStreams = [];
  let remoteAudioStreams = [];
  let rtpVideoSenders = [];
  let screenShare = false;
  let videoCamSSTrack;
  const screenShareBtn = document.querySelector('#btn-screenshare');

  async function init(
    server_function,
    stoped_screenshare_for_remote,
    my_socket_id
  ) {
    mySocketId = my_socket_id;
    serverFunction = server_function;
    stopedScreenShareForRemote = stoped_screenshare_for_remote;
    localVideoPlayer = document.getElementById('localVideoCtr');
    eventBinding();
  }

  function eventBinding() {
    screenShareBtn.addEventListener('click', async function () {
      if (screenShare == true) {
        stopedScreenShareForRemote(false);
        screenShare = false;
        videoCamSSTrack.stop();
        localVideoPlayer.srcObject = null;
        RemoveVideoSenders(rtpVideoSenders);
        screenShareBtn.classList.remove('red');
        screenShareBtn.classList.add('blue');
        screenShareBtn.innerHTML = '<i class="fas fa-desktop fa-lg"></i>';
        return;
      }
      try {
        stopedScreenShareForRemote(true);
        screenShare = true;
        let vstream = null;
        vstream = await navigator.mediaDevices.getDisplayMedia({
          width: { min: 4096 },
          height: { min: 2160 },
        });
        if (vstream.getVideoTracks().length > 0) {
          videoCamSSTrack = vstream.getVideoTracks()[0];
          localVideoPlayer.srcObject = new MediaStream([videoCamSSTrack]);
          AddUpdateVideoSenders(videoCamSSTrack, rtpVideoSenders);
        }
        screenShareBtn.classList.remove('blue');
        screenShareBtn.classList.add('red');
        screenShareBtn.innerHTML = '<i class="fas fa-ban fa-lg"></i>';
      } catch (e) {
        console.log(e);
        return;
      }
    });
  }

  async function RemoveVideoSenders(rtpSenders) {
    for (let id in peerConnectionIds) {
      if (rtpSenders[id] && IsConnectionAvailable(peerConnections[id])) {
        peerConnections[id].removeTrack(rtpSenders[id]);
        rtpSenders[id] = null;
        serverFunction();
      }
    }
  }

  async function AddUpdateVideoSenders(track, rtpSenders) {
    for (let con_id in peerConnectionIds) {
      if (IsConnectionAvailable(peerConnections[con_id])) {
        if (rtpSenders[con_id] && rtpSenders[con_id].track) {
          rtpSenders[con_id].replaceTrack(track);
        } else {
          rtpSenders[con_id] = peerConnections[con_id].addTrack(track);
        }
      }
    }
  }

  async function createConnection(socket_id) {
    let connection = new RTCPeerConnection(iceConfiguration);
    connection.onicecandidate = function (event) {
      if (event.candidate) {
        serverFunction(
          JSON.stringify({ iceCandidate: event.candidate }),
          socket_id
        );
      }
    };
    connection.onnegotiationneeded = async function (event) {
      await createOffer(socket_id);
    };

    connection.ontrack = function (event) {
      if (!remoteVideoStreams[socket_id]) {
        remoteVideoStreams[socket_id] = new MediaStream();
      }

      if (!remoteAudioStreams[socket_id])
        remoteAudioStreams[socket_id] = new MediaStream();

      if (event.track.kind == 'video') {
        remoteVideoStreams[socket_id]
          .getVideoTracks()
          .forEach((t) => remoteVideoStreams[socket_id].removeTrack(t));
        remoteVideoStreams[socket_id].addTrack(event.track);

        let remoteVideoPlayer = document.querySelector(`#v_${socket_id}`);
        remoteVideoPlayer.srcObject = null;
        remoteVideoPlayer.srcObject = remoteVideoStreams[socket_id];
        remoteVideoPlayer.load();
      } else if (event.track.kind == 'audio') {
        let remoteAudioPlayer = document.getElementById('a_' + socket_id);
        remoteAudioStreams[socket_id]
          .getVideoTracks()
          .forEach((t) => _remoteAudioStreams[socket_id].removeTrack(t));
        remoteAudioStreams[socket_id].addTrack(event.track);
        remoteAudioPlayer.srcObject = null;
        remoteAudioPlayer.srcObject = remoteAudioStreams[socket_id];
        remoteAudioPlayer.load();
      }
    };

    peerConnectionIds[socket_id] = socket_id;
    peerConnections[socket_id] = connection;

    if (screenShare) {
      if (videoCamSSTrack) {
        AddUpdateVideoSenders(videoCamSSTrack, rtpVideoSenders);
      }
    }

    return connection;
  }

  async function createOffer(socket_id) {
    let connection = peerConnections[socket_id];
    let offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    serverFunction(
      JSON.stringify({ offer: connection.localDescription }),
      socket_id
    );
  }

  async function exchangeSDP(message, socket_id) {
    message = JSON.parse(message);
    if (message.answer) {
      await peerConnections[socket_id].setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
    } else if (message.offer) {
      if (!peerConnections[socket_id]) {
        await createConnection(socket_id);
      }
      await peerConnections[socket_id].setRemoteDescription(
        new RTCSessionDescription(message.offer)
      );
      let answer = await peerConnections[socket_id].createAnswer();
      await peerConnections[socket_id].setLocalDescription(answer);
      serverFunction(JSON.stringify({ answer: answer }), socket_id, mySocketId);
    } else if (message.iceCandidate) {
      if (!peerConnections[socket_id]) {
        await createConnection(socket_id);
      }
      try {
        await peerConnections[socket_id].addIceCandidate(message.iceCandidate);
      } catch (e) {
        console.log(e);
      }
    }
  }

  function IsConnectionAvailable(connection) {
    if (
      connection &&
      (connection.connectionState == 'new' ||
        connection.connectionState == 'connecting' ||
        connection.connectionState == 'connected')
    ) {
      return true;
    } else return false;
  }

  function closeConnection(socket_id) {
    peerConnectionIds[socket_id] = null;

    if (peerConnections[socket_id]) {
      peerConnections[socket_id].close();
      peerConnections[socket_id] = null;
    }
    if (remoteAudioStreams[socket_id]) {
      remoteAudioStreams[socket_id].getTracks().forEach((t) => {
        if (t.stop) t.stop();
      });
      remoteAudioStreams[socket_id] = null;
    }

    if (remoteVideoStreams[socket_id]) {
      remoteVideoStreams[socket_id].getTracks().forEach((t) => {
        if (t.stop) t.stop();
      });
      remoteVideoStreams[socket_id] = null;
    }
  }

  return {
    init: async function (
      server_function,
      stoped_screenshare_for_remote,
      my_socket_id
    ) {
      await init(server_function, stoped_screenshare_for_remote, my_socket_id);
    },
    ExecuteClientFunction: async function (data, socket_id) {
      await exchangeSDP(data, socket_id);
    },
    createNewConnection: async function (socket_id) {
      await createConnection(socket_id);
    },
    closeExistingConnection: function (socket_id) {
      closeConnection(socket_id);
    },
    /* stopScreenShareRemote: function (socket_id) {
      stopScreenShare(socket_id);
    }, */
  };
})();
