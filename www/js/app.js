var app = angular.module('starter', ['ionic', 'ngCordova', 'deviceGyroscope', 'firebase']);

app.run(function ($ionicPlatform) {
  $ionicPlatform.ready(function () {
    if (window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if (window.StatusBar) {
      StatusBar.styleDefault();
    }
  });
});

app.controller('MotionController', function ($scope, $ionicPlatform, $cordovaDeviceMotion, $deviceGyroscope, $firebaseObject, $firebaseArray, $ionicLoading, $cordovaGeolocation) {

  $scope.options = {
    frequency: 100 // Measure every 100ms
  };


  // Current measurements
  $scope.measurements = {
    x_a: null,
    y_a: null,
    z_a: null,
    x_g: null,
    y_g: null,
    z_g: null,
    second: 8
  }

  // Watcher object
  $scope.watch = null;
  $scope.watch2 = null;
  $scope.watch3 = null;


  var ref = firebase.database().ref("record");
  var ref2 = firebase.database().ref("realtime");
  var obj = $firebaseObject(ref2);
  const beta = 0.033;
  const gravity = 9.80665;
  const speedLimit = 90;


  // var obj2 = $firebaseObject(ref);
  // obj.$remove();
  // obj2.$remove();
  // Start measurements when Cordova device is ready
  $ionicPlatform.ready(function () {

    var madgwick = new AHRS({

      /*
       * The sample interval, in Hz.
       */
      sampleInterval: $scope.options.frequency,

      /*
       * Choose from the `Madgwick` or `Mahony` filter.
       */
      algorithm: 'Madgwick',

      /*
       * The filter noise value, smaller values have
       * smoother estimates, but have higher latency.
       * This only works for the `Madgwick` filter.
       */
      beta: beta
    });
    var x_a, y_a, z_a, x_g, y_g, z_g, date, initQ, tmpQ, cnt = 0,
      sum3 = 0,
      sum6 = 0,
      judgeTime3 = 0,
      judgeTime6 = 0,
      judgeTimeAcc = 0,
      judgeTimeDcc = 0,
      judgeTimeStart = 0,
      judgeTimeStop = 0,
      judgeTimeSL = 0,
      judgeTimeLSL = 0,
      judgeCntSL = 0,
      judgeCntLSL = 0,
      judgeCnt3L = 0,
      judgeCnt3R = 0,
      judgeCnt6 = 0,
      judgeCntAcc = 0,
      judgeCntStart = 0,
      judgeCntDcc = 0,
      judgeCntStop = 0,
      judgeCntCC = 0,
      judgeCntCF = 0,
      speed = 0,
      acc = 0,
      accG = 0,
      timeG = 0,
      angularVel = 0,
      angularVelFor5 = 0,
      angularVel_cur = 0,
      CntLSL = 0,
      errorAngle3 = errorAngle6 = false;
    var sensorQueue = [];
    var compareQueue = [];
    var rotationAng = [];
    var uturnAng = [];
    var rotationCntL = [];
    var rotationCntR = [];
    var uturnCnt = [];
    var SLCnt = [];
    var LSLCnt = [];
    var AccCnt = [];
    var StartCnt = [];
    var DccCnt = [];
    var StopCnt = [];
    var CCCnt = [];
    var CFCnt = [];
    var rotationErr = [];
    var uturnErr = [];
    var accQueue = [];
    var speedList = [];
    var accList = [];
    var angularList = [];
    var speedGQueue = [];
    var timeGQueue = [];
    const calTime = 6000;
    const secondCnt = (1000 / $scope.options.frequency);

    //Start Watching method
    $scope.startWatching = function () {
      if (cnt == 0) {

        var inputLat;
        var long;
        var gpsSpeed = 0;
        var accuracy;
        var myLatlng;
        var pointList = [];

        $ionicLoading.show({
          template: '<ion-spinner icon="bubbles"></ion-spinner><br/>Acquiring location!'
        });

        var posOptions = {
          enableHighAccuracy: true,
          timeout: 1000,
          maximumAge: 0
        };
        function geo_success(position) {

          inputLat = position.coords.latitude;
          long = position.coords.longitude;
          gpsSpeed = position.coords.speed;
          gpsSpeed *= 3.6;
          accuracy = position.coords.accuracy;
          myLatlng = new google.maps.LatLng(inputLat, long);
          pointList.push({
            lat: inputLat,
            lng: long
          });
          $scope.measurements.test = gpsSpeed;
          $scope.measurements.timestamp = position.timestamp;
          if (position.coords.speed) {
            speedGQueue.push(gpsSpeed);
            timeGQueue.push(position.timestamp);
          }

          if (!!speedGQueue[1]) {

            accG = (speedGQueue[1] - speedGQueue[0]);

            speedGQueue.shift();
          }
          if (!!timeGQueue[1]) {

            timeG = (timeGQueue[1] - timeGQueue[0]) / 1000;

            timeGQueue.shift();
          }


          accList.push(accG);
          speedList.push(speedGQueue[0]);
          obj.accVel = Math.round(accG);
          obj.speed = Math.round(speedGQueue[0]);

          var mapOptions = {
            center: myLatlng,
            zoom: 16,
            mapTypeId: google.maps.MapTypeId.ROADMAP
          };
          var polyOption = {
            path: pointList,
            geodesic: true,
            strokeColor: 'red',
            strokeOpacity: 1.0,
            strokeWeight: 3.0,
            icons: [{ //방향을 알기 위한 화살표 표시
              icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW
              },
              offset: '100%',
              repeat: '150px'
            }]
          }

          var map = new google.maps.Map(document.getElementById("pathmap"), mapOptions);
          var poly = new google.maps.Polyline(polyOption);
          poly.setMap(map);
          $scope.map = map;
        }

        function geo_error() {
          console.log(err);
        }

        var geo_options = {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 3000
        };

        $scope.watch3 = navigator.geolocation.watchPosition(geo_success, geo_error, geo_options);


        var MaxQueue = ($scope.measurements.second * 200) / $scope.options.frequency;
        var errorRate = 0.04 / secondCnt;


        for (var i = 0; i < MaxQueue; i++)
          compareQueue.push(0);



        // Device motion configuration
        $scope.watch = $cordovaDeviceMotion.watchAcceleration($scope.options);
        $scope.watch2 = $deviceGyroscope.watch($scope.options);

        // Device motion initilaization
        $scope.watch.then(null, function (error) {
          console.log('Error');
        }, function (result) {

          // Set current Acc data
          x_a = result.x;
          y_a = result.y;
          z_a = result.z;


        });



        // Device motion initilaization
        $scope.watch2.then(null, function (error) {
          console.log('Error');
        }, function (result) {

          // Set current Gyro data
          x_g = result.x;
          y_g = result.y;
          z_g = result.z;

          madgwick.update(x_g, y_g, z_g, x_a, y_a, z_a, cnt);

          if (cnt == calTime / $scope.options.frequency) {
            initQ = madgwick.conj(); //Current posture estimation
            date = Date();
            $ionicLoading.hide();
          }
          if (cnt > calTime / $scope.options.frequency) {
            tmpQ = madgwick.getQuaternion();


            // //gravity compensation
            // x_a -= gravity * (2 * (tmpQ.x * tmpQ.z - tmpQ.w * tmpQ.y));
            // y_a -= gravity * (2 * (tmpQ.w * tmpQ.x + tmpQ.y * tmpQ.z));
            // z_a -= gravity * (tmpQ.w * tmpQ.w - tmpQ.x * tmpQ.x - tmpQ.y * tmpQ.y + tmpQ.z * tmpQ.z);

            // accQueue.push(Math.sqrt(Math.pow(x_a, 2) + Math.pow(y_a, 2) + Math.pow(z_a, 2)));



            // //speed calculate
            // let sum = acc / secondCnt;
            // speed += sum;
            // if (speed < 0)
            //   speed = 0;
            // speedList.push(speed.toFixed(2));


            // //send speed to the server in realtime
            // obj.speed = Math.round(speed);
            // obj.$save().then(function (ref) {
            //   ref.key() === obj.$id; // true
            // }, function (error) {
            //   console.log("Error:", error);
            // });


            //calibration
            madgwick.set(madgwick.multiply(initQ));
            sensorQueue.push(madgwick.getEulerAnglesDegrees().yaw);

            //angle calculate
            if (!!sensorQueue[1]) {
              if ((sensorQueue[0] - sensorQueue[1]) > 300) {
                compareQueue.push((sensorQueue[0] - sensorQueue[1]) - 360 - errorRate);
              } else if ((sensorQueue[0] - sensorQueue[1]) < -300) {
                compareQueue.push((sensorQueue[0] - sensorQueue[1]) + 360 - errorRate);
              } else {
                compareQueue.push(sensorQueue[0] - sensorQueue[1] - errorRate);
              }
              sensorQueue.shift();
            }


            //angularVel_cur calculate
            angularVel_cur = compareQueue[MaxQueue - 1] - compareQueue[MaxQueue - 1 - Math.round(MaxQueue * (5 / 6))];

            angularList.push(angularVel_cur.toFixed(2));

            obj.angularVel = Math.round(angularVel_cur);
            obj.$save().then(function (ref) {
              ref.key() === obj.$id; // true
            }, function (error) {
              console.log("Error:", error);
            });

            //angularVel calculate

            angularVel = compareQueue[MaxQueue - 1 - Math.round(MaxQueue * (3 / 6))] - compareQueue[MaxQueue - 1 - Math.round(MaxQueue * (4 / 6))];

            //angularVelFor5 calculate

            angularVelFor5 = compareQueue[MaxQueue - 1] - compareQueue[Math.round(MaxQueue / 6 - 1)];



            //error calculate
            errorAngle3 = errorAngle6 = false;
            for (var i = 0; i <= MaxQueue - Math.round(MaxQueue / 6); i++) {
              if (Math.abs(compareQueue.slice(i, i + Math.round(MaxQueue / 6)).reduce(function (a, b) {
                return a + b;
              })) > 60)
                errorAngle6 = true;
            }
            for (var i = MaxQueue / 2; i <= MaxQueue - Math.round(MaxQueue / 6); i++) {
              if (Math.abs(compareQueue.slice(i, i + Math.round(MaxQueue / 6)).reduce(function (a, b) {
                return a + b;
              })) > 60)
                errorAngle3 = true;
            }


            //angle judgement
            sum3 = compareQueue.slice(MaxQueue / 2, MaxQueue).reduce(function (a, b) {
              return a + b;
            });
            sum6 = compareQueue.slice(0, MaxQueue).reduce(function (a, b) {
              return a + b;
            });



            //rotation judge
            if (cnt - judgeTime3 > MaxQueue / 2 && !errorAngle3 && speedGQueue[0] > 30) {

              if (sum3 < -60 && sum3 > -120) {
                judgeCnt3L++;
                judgeTime3 = cnt;

                obj.rotationL = judgeCnt3L;
                obj.$save().then(function (ref) {
                  ref.key() === obj.$id; // true
                }, function (error) {
                  console.log("Error:", error);
                });
              }

              if (sum3 > 60 && sum3 < 120) {
                judgeCnt3R++;
                judgeTime3 = cnt;

                obj.rotationR = judgeCnt3R;
                obj.$save().then(function (ref) {
                  ref.key() === obj.$id; // true
                }, function (error) {
                  console.log("Error:", error);
                });
              }

            }

            //uturn judge
            if (cnt - judgeTime6 > MaxQueue && !errorAngle6 && speedGQueue[0] > 25) {

              if (Math.abs(sum6) > 160 && Math.abs(sum6) < 180) {
                judgeCnt6++;
                judgeTime6 = cnt;

                obj.uturn = judgeCnt6;
                obj.$save().then(function (ref) {
                  ref.key() === obj.$id; // true
                }, function (error) {
                  console.log("Error:", error);
                });
              }
            }

            //급가속
            if (cnt - judgeTimeAcc > MaxQueue && speedGQueue[0] >= 6 && accG >= 8) {
              judgeCntAcc++;
              judgeTimeAcc = cnt;
              obj.acc = judgeCntAcc;
              obj.$save().then(function (ref) {
                ref.key() === obj.$id; // true
              }, function (error) {
                console.log("Error:", error);
              });
            }
            //급출발
            if (cnt - judgeTimeStart > secondCnt && speedGQueue[0] <= 5 && accG >= 10) {
              judgeCntStart++;
              judgeTimeStart = cnt;
              obj.start = judgeCntStart;
              obj.$save().then(function (ref) {
                ref.key() === obj.$id; // true
              }, function (error) {
                console.log("Error:", error);
              });
            }

            //급감속
            if (cnt - judgeTimeDcc > MaxQueue && speedGQueue[0] >= 6 && accG <= -14) {
              judgeCntDcc++;
              judgeTimeDcc = cnt;
              obj.dcc = judgeCntDcc;
              obj.$save().then(function (ref) {
                ref.key() === obj.$id; // true
              }, function (error) {
                console.log("Error:", error);
              });
            }

            //급정지
            if (cnt - judgeTimeStop > secondCnt && speedGQueue[0] <= 5 && accG <= -14) {
              judgeCntStop++;
              judgeTimeStop = cnt;
              obj.stop = judgeCntStop;
              obj.$save().then(function (ref) {
                ref.key() === obj.$id; // true
              }, function (error) {
                console.log("Error:", error);
              });
            }

            //급진로변경 && 급앞지르기
            if (speedGQueue[0] >= 30 && Math.abs(angularVel) >= 10 && Math.abs(angularVelFor5) <= 2) {
              if (Math.abs(accG) <= 2)
                judgeCntCC++;

              if (accG >= 3)
                judgeCntCF++;

              obj.CC = judgeCntCC;
              obj.CF = judgeCntCF;
              obj.$save().then(function (ref) {
                ref.key() === obj.$id; // true
              }, function (error) {
                console.log("Error:", error);
              });

            }

            //과속
            if (cnt - judgeTimeSL > secondCnt * 3 && speedGQueue[0] >= speedLimit) {
              judgeCntSL++;
              judgeTimeSL = cnt;
              obj.SL = judgeCntSL;
              obj.$save().then(function (ref) {
                ref.key() === obj.$id; // true
              }, function (error) {
                console.log("Error:", error);
              });
            }

            //장기과속
            if (speedGQueue[0] >= speedLimit) {

              CntLSL++;

              if (cnt - judgeTimeLSL > secondCnt * 3 && CntLSL >= secondCnt * 20) {
                judgeCntLSL++;
                judgeTimeLSL = cnt;
                obj.LSL = judgeCntLSL;
                obj.$save().then(function (ref) {
                  ref.key() === obj.$id; // true
                }, function (error) {
                  console.log("Error:", error);
                });
              }
            }
            else {
              CntLSL = 0;
            }


            //데이터 저장
            rotationAng.push(sum3.toFixed(2));
            uturnAng.push(sum6.toFixed(2));
            rotationCntL.push(judgeCnt3L);
            rotationCntR.push(judgeCnt3R);
            uturnCnt.push(judgeCnt6);
            SLCnt.push(judgeCntSL);
            LSLCnt.push(judgeCntLSL);
            AccCnt.push(judgeCntAcc);
            StartCnt.push(judgeCntStart);
            DccCnt.push(judgeCntDcc);
            StopCnt.push(judgeCntStop);
            CCCnt.push(judgeCntCC);
            CFCnt.push(judgeCntCF);
            rotationErr.push(errorAngle3);
            uturnErr.push(errorAngle6);


            compareQueue.shift();

          }

          $scope.measurements.speedG = speedGQueue[0];
          $scope.measurements.accG = accG;
          $scope.measurements.ang = angularVel_cur.toFixed(2);
          $scope.measurements.cnt = cnt;
          $scope.measurements.alertAcc = judgeCntAcc;
          $scope.measurements.alertStart = judgeCntStart;
          $scope.measurements.alertDcc = judgeCntDcc;
          $scope.measurements.alertStop = judgeCntStop;
          $scope.measurements.alertCC = judgeCntCC;
          $scope.measurements.alertCF = judgeCntCF;
          $scope.measurements.alertSL = judgeCntSL;
          $scope.measurements.alertLSL = judgeCntLSL;
          $scope.measurements.alertL = judgeCnt3L;
          $scope.measurements.alertR = judgeCnt3R;
          $scope.measurements.alertU = judgeCnt6;



          if (cnt > calTime / $scope.options.frequency)
            madgwick.set(tmpQ);

          cnt++;

        });



      }

    };

    // Stop watching method
    $scope.stopWatching = function () {
      compareQueue = [];
      sensorQueue = [];
      accQueue = [];
      speedQueue = [];
      judgeTime3 = judgeTime6 = 0;
      speed = 0;
      acc = 0;

      $scope.watch.clearWatch();
      $scope.watch2.clearWatch();
      navigator.geolocation.clearWatch($scope.watch3);

      $scope.measurements.cnt = cnt = 0;
      $scope.measurements.sum = sum3 = 0;
      $scope.measurements.sumU = sum6 = 0;
      $scope.measurements.speedG = speedGQueue[0] = obj.speed = 0;
      $scope.measurements.accG = accG = obj.accVel = 0;
      $scope.measurements.ang = angularVel_cur = obj.angularVel = 0;
      $scope.measurements.alertL = judgeCnt3L = obj.rotationL = 0;
      $scope.measurements.alertR = judgeCnt3R = obj.rotationR = 0;
      $scope.measurements.alertU = judgeCnt6 = obj.uturn = 0;
      $scope.measurements.alertAcc = judgeCntAcc = obj.acc = 0;
      $scope.measurements.alertDcc = judgeCntDcc = obj.dcc = 0;
      $scope.measurements.alertStart = judgeCntStart = obj.start = 0;
      $scope.measurements.alertStop = judgeCntStop = obj.stop = 0;
      $scope.measurements.alertCC = judgeCntCC = obj.CC = 0;
      $scope.measurements.alertCF = judgeCntCF = obj.CF = 0;
      $scope.measurements.alertSL = judgeCntSL = obj.SL = 0;
      $scope.measurements.alertLSL = judgeCntLSL = obj.LSL = 0;
      $scope.measurements.speed = speed = obj.speed = 0;

      obj.$save().then(function (ref) {
        ref.key() === obj.$id; // true5
      }, function (error) {
        console.log("Error:", error);
      });


      let list = $firebaseArray(ref);
      let logData = {
        date,
        rotationAng,
        uturnAng,
        rotationCntL,
        rotationCntR,
        uturnCnt,
        rotationErr,
        uturnErr,
        speedList,
        accList,
        angularList,
        SLCnt,
        LSLCnt,
        AccCnt,
        StartCnt,
        DccCnt,
        StopCnt,
        CCCnt,
        CFCnt
      }
      list.$add(logData).then(function (ref) {
        var id = ref.key();
        console.log("added record with id " + id);
        list.$indexFor(id); // returns location in the array
      });

      rotationAng = [];
      uturnAng = [];
      rotationCntL = [];
      rotationCntR = [];
      uturnCnt = [];
      rotationErr = [];
      uturnErr = [];
      speedList = [];
      accList = [];
      angularList = [];
      SLCnt = [];
      LSLCnt = [];
      AccCnt = [];
      StartCnt = [];
      DccCnt = [];
      StopCnt = [];
      CCCnt = [];
      CFCnt = [];



    }


  });

  $scope.$on('$ionicView.beforeLeave', function () {
    $scope.watch.clearWatch(); // Turn off motion detection watcher
    $scope.watch2.clearWatch(); // Turn off motion detection watcher
    navigator.geolocation.clearWatch($scope.watch3);
  });

});
