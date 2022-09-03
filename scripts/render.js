import { SatelliteOrbit } from "./algorithms.js";
import * as THREE from "./third-party/three.js";
import { OrbitControls } from "./third-party/OrbitControls.js";
import { FontLoader } from "./third-party/FontLoader.js";
import { TextGeometry } from "./third-party/TextGeometry.js";

try {
  // 重力常数
  const gM = 3.986004418E+14
  // 地球自转角速度
  const omegaEarthRotate = 7.292E-05

  // 暂时存储卫星信息的类
  let satelliteRawInformationMap = new Map();
  // 当前选中的卫星的信息，默认为null
  let satelliteSelected = null;
  // 当前卫星计算得到的天球坐标系的坐标数据，以120秒为间隔，总共长度48h，也即1440个点；加上开始点，总共1441个点，格式：Array[ { x : float , y : float , z : float } , …… ]
  let currentSatelliteCelestialPositionData;
  // 当前卫星计算得到的地球坐标系的坐标数据，以120秒为间隔，总共长度48h，也即1440个点；加上开始点，总共1441个点，格式：Array[ { x : float , y : float , z : float } , …… ]
  let currentSatelliteEarthPositionData;
  // 当前卫星步进次数，间隔为120秒
  let currentSatelliteCondition = 0;
  // three.js的三维可视化对象初始化，生成canvas、scene、camera、control等
  let drawboard = document.getElementById("render_field");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    drawboard.offsetWidth / drawboard.offsetHeight,
    0.1,
    1000000
  );
  let renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.Enabled = true;
  renderer.setSize(drawboard.offsetWidth, drawboard.offsetHeight);
  drawboard.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.update();
  controls.addEventListener('change', function () {
    renderer.render(scene, camera);
  });
  // 读取管理器，用来指示下载状况
  const manager = new THREE.LoadingManager();
  // 读取字体并且显示
  const fontLoader = new FontLoader(manager);
  let font;
  fontLoader.load("./scripts/third-party/Arial_Bold.json", function (threeFont) {
    font = threeFont;
  });
  // 地球渲染对象，方便进行步进时的差分渲染
  let earthMesh = null;
  // 坐标轴对象，方便进行旋转
  let xAxis = null;
  let yAxis = null;
  let zAxis = null;
  // 坐标轴字体对象，方便进行旋转
  let xTextMesh = null;
  let yTextMesh = null;
  let zTextMesh = null;
  // 三维可视化时的XYZ文字指示
  let parentTextObject = new THREE.Object3D();
  // 卫星对象，方便进行步进时的差分渲染
  let satellite3DObj = null;
  // 自动步进的进程ID
  let autoStepProcessID = null;

  // 窗体缩放时需要的操作
  function WindowChanged() {
    camera.aspect = drawboard.offsetWidth / drawboard.offsetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(drawboard.offsetWidth, drawboard.offsetHeight);
    renderer.render(scene, camera);
  }

  // 清除所有对象的函数
  function ClearScene() {
    while (scene.children.length > 0) {
      scene.remove(scene.children[scene.children.length - 1]);
    }
  }
  // 读取文件，并且将原始数据存储到satelliteRawInformationMap中；同时更新页面，显示卫星选择列表
  function LoadFilesAndToMap() {
    // 清空原有数据
    satelliteRawInformationMap = new Map();
    currentSatelliteCelestialPositionData = new Array();
    currentSatelliteEarthPositionData = new Array();
    currentSatelliteCondition = 0;
    document.getElementById("data").innerHTML = `
                <tr>
                    <th>gM</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>sqrtA</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>deltaN</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>toe</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>m0</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>eccentricity</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>smallOmega</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>iDot</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>i0</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>cUc</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>cUs</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>cRc</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>cRs</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>cIc</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>cIs</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>bigOmega</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>bigOmegaDot</th>
                    <td>等待数据输入</td>
                </tr>
                <tr>
                    <th>smallOmegaE</th>
                    <td>等待数据输入</td>
                </tr>`;
    document.getElementById("stop_auto_stepping").setAttribute("disabled", "");
    document.getElementById("start_auto_stepping").setAttribute("disabled", "");
    document.getElementById("manual_stepping").setAttribute("disabled", "");
    ClearScene();
    renderer.render(scene, camera);
    // 文件读取
    let fileReader = new FileReader();
    fileReader.onload = function () {
      // 读取文件+载入数据的函数
      let splittedLines = fileReader.result.trim().split(/[\r\n]+/);
      // 检查是否为RINEX文件、版本是否为2.10；如果不是的话就清空数据，同时画布也要清空
      if (!splittedLines[0].match(/ *2.10.*RINEX VERSION \/ TYPE.*/)) {
        alert("您选择的文件不是RINEX 2.10版本的数据，请重试。");
        let selectbox = document.getElementById("satellite_select_box");
        selectbox.innerHTML = `<option value="" selected>请选择卫星</option>`;
        selectbox.setAttribute("disabled", "");
        satelliteSelected = null;
        return;
      }
      // 是否已经读取到了头文件尾
      let isEndOfHeader = false;
      // 暂存八行数据的列表
      let tempData = new Array();
      // 当前到了第几行了
      let currentLine = 1;
      for (let i = 0; i < splittedLines.length; i++) {
        // 未到头文件尾
        if (!isEndOfHeader) {
          // 达到头文件尾
          if (splittedLines[i].trim() == "END OF HEADER") {
            isEndOfHeader = true;
          }
          //已经到了主体部分
        } else {
          // 当前行数是否已经到了第九行，也即读取完毕，此时应当输出并清空temp，然后继续接下来的读取进程
          if (currentLine == 9) {
            currentLine = 1;
            // 暂时存储卫星信息的字符串，格式为：
            // "PRN cRs deltaN m0 cUs eccentricity cUc sqrtA toe cIc bigOmega cIs i0 cRc smallOmega bigOmegaDot iDot"
            let satelliteInfoString = "";
            for (let j = 0; j < tempData.length; j++) {
              tempData[j] = tempData[j].replaceAll("D", "E");
              satelliteInfoString += tempData[j].trim() + " ";
            }
            satelliteRawInformationMap.set(satelliteInfoString.trim(), true);
            tempData = new Array();
          }
          let tempDataSecond = splittedLines[i].trim().split(/ +/);
          if (currentLine == 1) {
            tempData.push(tempDataSecond[0]);
          } else if (currentLine == 2) {
            tempData.push(tempDataSecond[1], tempDataSecond[2], tempDataSecond[3]);
          } else if (currentLine == 3) {
            tempData.push(tempDataSecond[0], tempDataSecond[1], tempDataSecond[2], tempDataSecond[3]);
          } else if (currentLine == 4) {
            tempData.push(tempDataSecond[0], tempDataSecond[1], tempDataSecond[2], tempDataSecond[3]);
          } else if (currentLine == 5) {
            tempData.push(tempDataSecond[0], tempDataSecond[1], tempDataSecond[2], tempDataSecond[3]);
          } else if (currentLine == 6) {
            tempData.push(tempDataSecond[0]);
          }
          currentLine++;
          continue;
        }
      }
      alert("星历加载完成，共找到" + satelliteRawInformationMap.size + "组在本程序中可能会产生不同可视化效果的数据。请在左侧导航栏中选择需要的数据进行可视化。\n操作指南：鼠标左键旋转，鼠标滚轮缩放，鼠标右键平移。");

      // 修改卫星下拉列表，以实现选择
      let selectbox = document.getElementById("satellite_select_box");
      selectbox.innerHTML = `<option value="" selected hidden>请选择卫星</option>`;
      selectbox.removeAttribute("disabled");
      let iterator = satelliteRawInformationMap.keys();
      selectbox.innerHTML += `<option value="${"-1 9.84375 4.90020411317E-09 -3.28589423754E-01 1.39698386192E-06 8.62177996896E-03 6.38887286186E-07 5.15362551117E+03 2.88E+04 2.23517417908E-08 -2.04954026785E+00 7.82310962677E-08 9.67834541393E-01 3.59437500000E+02 8.86589852723E-01 -8.68643325338E-09 6.21454457501E-11"}">Lesson 3.1 PPT示例数据</option>`
      for (let i = 0; i < satelliteRawInformationMap.size; i++) {
        let data = iterator.next()["value"]
        selectbox.innerHTML += `<option value="${data}">${"PRN:" + data.split(" ")[0] + "&nbsp;&nbsp;&nbsp;&nbsp;数据编号" + (i + 1)}</option>`
      }
    };
    fileReader.readAsText(this.files[0]);
    this.value = null;
  }

  // 当下拉列表选择之后调用的函数，功能：读取卫星参数，初始化数据，之后调用渲染函数
  function SelectboxChanged() {
    currentSatelliteCondition = 0;

    let selectbox = document.getElementById("satellite_select_box");
    let satelliteStringSplitted = selectbox.value.split(" ");

    document.getElementById("stop_auto_stepping").setAttribute("disabled", "");
    document.getElementById("start_auto_stepping").removeAttribute("disabled");
    document.getElementById("manual_stepping").removeAttribute("disabled");

    satelliteSelected = new SatelliteOrbit(gM,
      parseFloat(satelliteStringSplitted[7]),
      parseFloat(satelliteStringSplitted[2]),
      parseFloat(satelliteStringSplitted[8]),
      parseFloat(satelliteStringSplitted[3]),
      parseFloat(satelliteStringSplitted[5]),
      parseFloat(satelliteStringSplitted[14]),
      parseFloat(satelliteStringSplitted[16]),
      parseFloat(satelliteStringSplitted[12]),
      parseFloat(satelliteStringSplitted[6]),
      parseFloat(satelliteStringSplitted[4]),
      parseFloat(satelliteStringSplitted[13]),
      parseFloat(satelliteStringSplitted[1]),
      parseFloat(satelliteStringSplitted[9]),
      parseFloat(satelliteStringSplitted[11]),
      parseFloat(satelliteStringSplitted[10]),
      parseFloat(satelliteStringSplitted[15]),
      omegaEarthRotate);

    document.getElementById("data").innerHTML = `
  <tr>
    <th>gM</th>
    <td>${gM}</td>
  </tr>
  <tr>
    <th>sqrtA</th>
    <td>${satelliteStringSplitted[7]}</td>
  </tr>
  <tr>
    <th>deltaN</th>
    <td>${satelliteStringSplitted[2]}</td>
  </tr>
  <tr>
    <th>toe</th>
    <td>${satelliteStringSplitted[8]}</td>
  </tr>
  <tr>
    <th>m0</th>
    <td>${satelliteStringSplitted[3]}</td>
  </tr>
  <tr>
    <th>eccentricity</th>
    <td>${satelliteStringSplitted[5]}</td>
  </tr>
  <tr>
    <th>smallOmega</th>
    <td>${satelliteStringSplitted[14]}</td>
  </tr>
  <tr>
    <th>iDot</th>
    <td>${satelliteStringSplitted[16]}</td>
  </tr>
  <tr>
    <th>i0</th>
    <td>${satelliteStringSplitted[12]}</td>
  </tr>
  <tr>
    <th>cUc</th>
    <td>${satelliteStringSplitted[6]}</td>
  </tr>
  <tr>
    <th>cUs</th>
    <td>${satelliteStringSplitted[4]}</td>
  </tr>
  <tr>
    <th>cRc</th>
    <td>${satelliteStringSplitted[13]}</td>
  </tr>
  <tr>
    <th>cRs</th>
    <td>${satelliteStringSplitted[1]}</td>
  </tr>
  <tr>
    <th>cIc</th>
    <td>${satelliteStringSplitted[9]}</td>
  </tr>
  <tr>
    <th>cIs</th>
    <td>${satelliteStringSplitted[11]}</td>
  </tr>
  <tr>
    <th>bigOmega</th>
    <td>${satelliteStringSplitted[10]}</td>
  </tr>
  <tr>
    <th>bigOmegaDot</th>
    <td>${satelliteStringSplitted[15]}</td>
  </tr>
  <tr>
    <th>smallOmegaE</th>
    <td>${omegaEarthRotate}</td>
  </tr>
  `;
    currentSatelliteCelestialPositionData = new Array();
    currentSatelliteEarthPositionData = new Array();
    currentSatelliteCondition = 0;

    for (let i = 0; i <= 172800; i += 120) {
      currentSatelliteCelestialPositionData.push(satelliteSelected.CalcCelestialCoordinatePositionXYZ(i));
      currentSatelliteEarthPositionData.push(satelliteSelected.CalcEarthCoordinatePositionXYZ(i));
    }

    Render();
  }

  // 服务于步进过程，设置卫星位置和地球自转情况
  function SetSatelliteAndEarthPosition() {
    if (!(satellite3DObj == null)) {
      if (document.getElementById("3d_radio").checked) {
        satellite3DObj.position.x = satelliteSelected.CalcCelestialCoordinatePositionXYZ(currentSatelliteCondition * 120)["y"] / 10000;
        satellite3DObj.position.y = satelliteSelected.CalcCelestialCoordinatePositionXYZ(currentSatelliteCondition * 120)["z"] / 10000;
        satellite3DObj.position.z = satelliteSelected.CalcCelestialCoordinatePositionXYZ(currentSatelliteCondition * 120)["x"] / 10000;
      } else if (document.getElementById("sky_radio").checked) {
        satellite3DObj.position.x = satelliteSelected.CalcCelestialCoordinatePositionXYZ(currentSatelliteCondition * 120)["x"] / 10000;
        satellite3DObj.position.y = satelliteSelected.CalcCelestialCoordinatePositionXYZ(currentSatelliteCondition * 120)["y"] / 10000;
        satellite3DObj.position.z = 0;
      } else if (document.getElementById("earth_radio").checked) {
        satellite3DObj.position.x = satelliteSelected.CalcEarthCoordinatePositionXYZ(currentSatelliteCondition * 120)["x"] / 10000;
        satellite3DObj.position.y = satelliteSelected.CalcEarthCoordinatePositionXYZ(currentSatelliteCondition * 120)["y"] / 10000;
        satellite3DObj.position.z = 0;
      }
      else if (document.getElementById("earth_3d_radio").checked) {
        satellite3DObj.position.x = satelliteSelected.CalcEarthCoordinatePositionXYZ(currentSatelliteCondition * 120)["y"] / 10000;
        satellite3DObj.position.y = satelliteSelected.CalcEarthCoordinatePositionXYZ(currentSatelliteCondition * 120)["z"] / 10000;
        satellite3DObj.position.z = satelliteSelected.CalcEarthCoordinatePositionXYZ(currentSatelliteCondition * 120)["x"] / 10000;
      }
    }
    if ((!(earthMesh == null)) && document.getElementById("3d_radio").checked) {
      earthMesh.rotation.y = (omegaEarthRotate * 120 * currentSatelliteCondition) - 90 * Math.PI / 180;
    }
    if (document.getElementById("3d_radio").checked) {
      if ((!(xAxis == null)) && (!(yAxis == null)) && (!(zAxis == null))) {
        xAxis.rotation.y = (omegaEarthRotate * 120 * currentSatelliteCondition);
        yAxis.rotation.y = (omegaEarthRotate * 120 * currentSatelliteCondition);
        parentTextObject.rotation.y = (omegaEarthRotate * 120 * currentSatelliteCondition);
      }
    }
  }

  // 根据卫星数据和当前参数绘图
  function Render() {
    // 三维可视化之前需要清空原来的数据
    ClearScene();
    renderer.render(scene, camera);
    // 如果没有卫星数据就不进行渲染
    if (satelliteSelected == null) {
      return;
    }
    // 美化效果：氛围光、点光源
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    let directionalLight = new THREE.DirectionalLight(0xffffff, 0.65);
    directionalLight.position.set(5000, 5000, 5000);
    scene.add(directionalLight);
    // 选择三维可视化之后的动作
    if (document.getElementById("3d_radio").checked) {

      // 绘制卫星轨迹
      let material = new THREE.LineBasicMaterial({ color: 0x0000ff });
      let points = new Array();
      for (let i = 0; i < currentSatelliteCelestialPositionData.length; i++) {
        points.push(new THREE.Vector3(currentSatelliteCelestialPositionData[i]["y"] / 10000,
          currentSatelliteCelestialPositionData[i]["z"] / 10000,
          currentSatelliteCelestialPositionData[i]["x"] / 10000));
      }
      let geometry = new THREE.BufferGeometry().setFromPoints(points);
      let line = new THREE.Line(geometry, material);
      scene.add(line);

      // 绘制坐标轴以及文字
      let xMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      let xGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 4000)
      ])
      xAxis = new THREE.Line(xGeometry, xMaterial);
      scene.add(xAxis);
      let xFontGeometry = new TextGeometry("X", {
        font: font,
        size: 200,
        height: 120
      })
      xTextMesh = new THREE.Mesh(xFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
          new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        ]);
      xTextMesh.position.x = 50;
      xTextMesh.position.y = 50;
      xTextMesh.position.z = 4000;
      parentTextObject.add(xTextMesh);

      let yMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
      let yGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(4000, 0, 0)
      ])
      yAxis = new THREE.Line(yGeometry, yMaterial);
      scene.add(yAxis);
      let yFontGeometry = new TextGeometry("Y", {
        font: font,
        size: 200,
        height: 120
      })
      yTextMesh = new THREE.Mesh(yFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0xff0000 }),
          new THREE.MeshPhongMaterial({ color: 0xff0000 })
        ]);
      yTextMesh.position.x = 4000;
      yTextMesh.position.y = 50;
      yTextMesh.position.z = 50;
      parentTextObject.add(yTextMesh);
      camera.position.set(2000, 2000, 7000);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);

      let zMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
      let zGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4000, 0)
      ])
      zAxis = new THREE.Line(zGeometry, zMaterial);
      scene.add(zAxis);
      let zFontGeometry = new TextGeometry("Z", {
        font: font,
        size: 200,
        height: 120
      })
      zTextMesh = new THREE.Mesh(zFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0xffff00 }),
          new THREE.MeshPhongMaterial({ color: 0xffff00 })
        ]);
      zTextMesh.position.x = 50;
      zTextMesh.position.y = 4000;
      zTextMesh.position.z = 50;
      parentTextObject.add(zTextMesh);
      scene.add(parentTextObject);

      // 添加地球
      let earthGeometry = new THREE.SphereGeometry(6378100 / 10000, 100, 100);
      let earthMaterial = new THREE.MeshPhongMaterial();
      earthMaterial.map = new THREE.TextureLoader(manager).load('./images/earthmap1k.jpg', function () {
        earthMaterial.bumpMap = new THREE.TextureLoader(manager).load('./images/dG4sE.jpg', function () {
          earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
          earthMesh.rotation.y = -90 * Math.PI / 180;

          scene.add(earthMesh);
          // 添加卫星
          let satellite3DGeometry = new THREE.BoxGeometry(100, 100, 100);
          let satellite3DMaterial = new THREE.MeshPhongMaterial({ color: 0x00AAE4 });
          satellite3DObj = new THREE.Mesh(satellite3DGeometry, satellite3DMaterial);
          scene.add(satellite3DObj);
          // 添加赤道
          let circleLineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
          let circlePoints = [];
          for (let i = 0; i <= 360; i++) {
            circlePoints.push(new THREE.Vector3(Math.cos(i * Math.PI / 180) * 6480000 / 10000, 0, Math.sin(i * Math.PI / 180) * 6480000 / 10000));
          }
          let circleLineGeometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
          let circleLine = new THREE.Line(circleLineGeometry, circleLineMaterial);
          scene.add(circleLine);
          //设置卫星位置和地球自转情况
          SetSatelliteAndEarthPosition();
          renderer.render(scene, camera);
        });
      });
    }
    else if (document.getElementById("earth_3d_radio").checked) {

      // 绘制卫星轨迹
      let material = new THREE.LineBasicMaterial({ color: 0x0000ff });
      let points = new Array();
      for (let i = 0; i < currentSatelliteCelestialPositionData.length; i++) {
        points.push(new THREE.Vector3(currentSatelliteEarthPositionData[i]["y"] / 10000,
          currentSatelliteEarthPositionData[i]["z"] / 10000,
          currentSatelliteEarthPositionData[i]["x"] / 10000));
      }
      let geometry = new THREE.BufferGeometry().setFromPoints(points);
      let line = new THREE.Line(geometry, material);
      scene.add(line);

      // 绘制坐标轴以及文字
      let xMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      let xGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 4000)
      ])
      xAxis = new THREE.Line(xGeometry, xMaterial);
      scene.add(xAxis);
      let xFontGeometry = new TextGeometry("X", {
        font: font,
        size: 200,
        height: 120
      })
      xTextMesh = new THREE.Mesh(xFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
          new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        ]);
      xTextMesh.position.x = 50;
      xTextMesh.position.y = 50;
      xTextMesh.position.z = 4000;
      scene.add(xTextMesh);

      let yMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
      let yGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(4000, 0, 0)
      ])
      yAxis = new THREE.Line(yGeometry, yMaterial);
      scene.add(yAxis);
      let yFontGeometry = new TextGeometry("Y", {
        font: font,
        size: 200,
        height: 120
      })
      yTextMesh = new THREE.Mesh(yFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0xff0000 }),
          new THREE.MeshPhongMaterial({ color: 0xff0000 })
        ]);
      yTextMesh.position.x = 4000;
      yTextMesh.position.y = 50;
      yTextMesh.position.z = 50;
      scene.add(yTextMesh);
      camera.position.set(2000, 2000, 7000);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);

      let zMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
      let zGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4000, 0)
      ])
      zAxis = new THREE.Line(zGeometry, zMaterial);
      scene.add(zAxis);
      let zFontGeometry = new TextGeometry("Z", {
        font: font,
        size: 200,
        height: 120
      })
      zTextMesh = new THREE.Mesh(zFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0xffff00 }),
          new THREE.MeshPhongMaterial({ color: 0xffff00 })
        ]);
      zTextMesh.position.x = 50;
      zTextMesh.position.y = 4000;
      zTextMesh.position.z = 50;
      scene.add(zTextMesh);

      // 添加地球
      let earthGeometry = new THREE.SphereGeometry(6378100 / 10000, 100, 100);
      let earthMaterial = new THREE.MeshPhongMaterial();
      earthMaterial.map = new THREE.TextureLoader(manager).load('./images/earthmap1k.jpg', function () {
        earthMaterial.bumpMap = new THREE.TextureLoader(manager).load('./images/dG4sE.jpg', function () {
          earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
          earthMesh.rotation.y = -90 * Math.PI / 180;

          scene.add(earthMesh);
          // 添加卫星
          let satellite3DGeometry = new THREE.BoxGeometry(100, 100, 100);
          let satellite3DMaterial = new THREE.MeshPhongMaterial({ color: 0x00AAE4 });
          satellite3DObj = new THREE.Mesh(satellite3DGeometry, satellite3DMaterial);
          scene.add(satellite3DObj);
          // 添加赤道
          let circleLineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
          let circlePoints = [];
          for (let i = 0; i <= 360; i++) {
            circlePoints.push(new THREE.Vector3(Math.cos(i * Math.PI / 180) * 6480000 / 10000, 0, Math.sin(i * Math.PI / 180) * 6480000 / 10000));
          }
          let circleLineGeometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
          let circleLine = new THREE.Line(circleLineGeometry, circleLineMaterial);
          scene.add(circleLine);
          //设置卫星位置和地球自转情况
          SetSatelliteAndEarthPosition();
          renderer.render(scene, camera);
        });
      });
    }
    // 选择二维地球坐标系可视化之后的动作
    else if (document.getElementById("earth_radio").checked) {
      // 绘制卫星轨迹
      let material = new THREE.LineBasicMaterial({ color: 0x0000ff });
      let points = new Array();
      for (let i = 0; i < currentSatelliteEarthPositionData.length; i++) {
        points.push(new THREE.Vector3(currentSatelliteEarthPositionData[i]["x"] / 10000,
          currentSatelliteEarthPositionData[i]["y"] / 10000,
          0));
      }
      let geometry = new THREE.BufferGeometry().setFromPoints(points);
      let line = new THREE.Line(geometry, material);
      scene.add(line);

      // 绘制坐标轴以及文字
      let xMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      let xGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-4000, 0, 0), new THREE.Vector3(4000, 0, 0)
      ])
      let xAxis = new THREE.Line(xGeometry, xMaterial);
      scene.add(xAxis);
      let xFontGeometry = new TextGeometry("X", {
        font: font,
        size: 200,
        height: 120
      })
      let xTextMesh = new THREE.Mesh(xFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
          new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        ]);
      xTextMesh.position.x = 4000;
      xTextMesh.position.y = 50;
      xTextMesh.position.z = 50;
      scene.add(xTextMesh);

      let yMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
      let yGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -4000, 0), new THREE.Vector3(0, 4000, 0)
      ])
      let yAxis = new THREE.Line(yGeometry, yMaterial);
      scene.add(yAxis);
      let yFontGeometry = new TextGeometry("Y", {
        font: font,
        size: 200,
        height: 120
      })
      let yTextMesh = new THREE.Mesh(yFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0xff0000 }),
          new THREE.MeshPhongMaterial({ color: 0xff0000 })
        ]);
      yTextMesh.position.x = 50;
      yTextMesh.position.y = 4000;
      yTextMesh.position.z = 50;
      scene.add(yTextMesh);
      camera.position.set(0, 0, 7000);
      camera.lookAt(0, 0, 0);
      // 添加卫星
      let satellite3DGeometry = new THREE.BoxGeometry(100, 100, 100);
      let satellite3DMaterial = new THREE.MeshPhongMaterial({ color: 0x00AAE4 });
      satellite3DObj = new THREE.Mesh(satellite3DGeometry, satellite3DMaterial);
      scene.add(satellite3DObj);

      //设置卫星位置和地球自转情况
      SetSatelliteAndEarthPosition();
      renderer.render(scene, camera);
    }
    // 选择二维天球坐标系可视化之后的动作
    else if (document.getElementById("sky_radio").checked) {
      // 绘制卫星轨迹
      let material = new THREE.LineBasicMaterial({ color: 0x0000ff });
      let points = new Array();
      for (let i = 0; i < currentSatelliteCelestialPositionData.length; i++) {
        points.push(new THREE.Vector3(currentSatelliteCelestialPositionData[i]["x"] / 10000,
          currentSatelliteCelestialPositionData[i]["y"] / 10000,
          0));
      }
      let geometry = new THREE.BufferGeometry().setFromPoints(points);
      let line = new THREE.Line(geometry, material);
      scene.add(line);

      // 绘制坐标轴以及文字
      let xMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      let xGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-4000, 0, 0), new THREE.Vector3(4000, 0, 0)
      ])
      let xAxis = new THREE.Line(xGeometry, xMaterial);
      scene.add(xAxis);
      let xFontGeometry = new TextGeometry("X", {
        font: font,
        size: 200,
        height: 120
      })
      let xTextMesh = new THREE.Mesh(xFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
          new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        ]);
      xTextMesh.position.x = 4000;
      xTextMesh.position.y = 50;
      xTextMesh.position.z = 50;
      scene.add(xTextMesh);

      let yMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
      let yGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -4000, 0), new THREE.Vector3(0, 4000, 0)
      ])
      let yAxis = new THREE.Line(yGeometry, yMaterial);
      scene.add(yAxis);
      let yFontGeometry = new TextGeometry("Y", {
        font: font,
        size: 200,
        height: 120
      })
      let yTextMesh = new THREE.Mesh(yFontGeometry,
        [
          new THREE.MeshPhongMaterial({ color: 0xff0000 }),
          new THREE.MeshPhongMaterial({ color: 0xff0000 })
        ]);
      yTextMesh.position.x = 50;
      yTextMesh.position.y = 4000;
      yTextMesh.position.z = 50;
      scene.add(yTextMesh);
      camera.position.set(0, 0, 7000);
      camera.lookAt(0, 0, 0);
      // 添加卫星
      let satellite3DGeometry = new THREE.BoxGeometry(100, 100, 100);
      let satellite3DMaterial = new THREE.MeshPhongMaterial({ color: 0x00AAE4 });
      satellite3DObj = new THREE.Mesh(satellite3DGeometry, satellite3DMaterial);
      scene.add(satellite3DObj);

      //设置卫星位置和地球自转情况
      SetSatelliteAndEarthPosition();
      renderer.render(scene, camera);
    }
  }

  // 手动步进时的操作
  function Step120s() {
    if (satelliteSelected != null) {
      currentSatelliteCondition++;
      SetSatelliteAndEarthPosition();
      renderer.render(scene, camera);
    }
  }

  // 自动步进时的间隔
  function Step20s() {
    if (satelliteSelected != null) {
      currentSatelliteCondition += 20 / 120;
      SetSatelliteAndEarthPosition();
      renderer.render(scene, camera);
    }
  }

  function StartAutoStepping() {
    autoStepProcessID = setInterval(Step20s, 2);
    document.getElementById("read_file").setAttribute("disabled", "");
    document.getElementById("satellite_select_box").setAttribute("disabled", "");
    document.getElementById("manual_stepping").setAttribute("disabled", "");
    document.getElementById("start_auto_stepping").setAttribute("disabled", "");
    document.getElementById("stop_auto_stepping").removeAttribute("disabled");
  }

  function StopAutoStepping() {
    clearInterval(autoStepProcessID);
    document.getElementById("read_file").removeAttribute("disabled");
    document.getElementById("satellite_select_box").removeAttribute("disabled");
    document.getElementById("manual_stepping").removeAttribute("disabled");
    document.getElementById("start_auto_stepping").removeAttribute("disabled");
    document.getElementById("stop_auto_stepping").setAttribute("disabled", "");
  }

  // 添加事件监听器
  document.getElementById("read_file").addEventListener(
    "click",
    function (e) {
      document.getElementById("file_loader").click();
    },
    false
  );

  document
    .getElementById("file_loader")
    .addEventListener("change", LoadFilesAndToMap);

  document.getElementById("satellite_select_box").addEventListener("change", SelectboxChanged);

  window.addEventListener('resize', WindowChanged, false);

  document.getElementById("sky_radio").addEventListener("change", Render, false);
  document.getElementById("earth_radio").addEventListener("change", Render, false);
  document.getElementById("3d_radio").addEventListener("change", Render, false);
  document.getElementById("earth_3d_radio").addEventListener("change", Render, false);

  document.getElementById("manual_stepping").addEventListener("click", Step120s, false);
  document.getElementById("start_auto_stepping").addEventListener("click", StartAutoStepping, false);
  document.getElementById("stop_auto_stepping").addEventListener("click", StopAutoStepping, false);

  manager.onStart = function (url, itemsLoaded, itemsTotal) {
    document.getElementById("loading_indicator").innerHTML = "三维可视化数据加载中...<br>目前的可视化体验可能降级";
    document.getElementById("loading_indicator").style["color"] = "red";
  };

  manager.onProgress = function (url, itemsLoaded, itemsTotal) {
    document.getElementById("loading_indicator").innerHTML = "三维可视化数据加载中...<br>目前的可视化体验可能降级";
    document.getElementById("loading_indicator").style["color"] = "red";
  };

  manager.onLoad = function () {
    document.getElementById("loading_indicator").innerHTML = "资源加载完毕！<br>请进行下一步的操作";
    document.getElementById("loading_indicator").style["color"] = "green";
  };
} catch (error) {
  document.getElementById("loading_indicator").innerHTML = "您的浏览器版本过低，无法正常执行脚本。<br>建议使用最新版浏览器！";
  document.getElementById("loading_indicator").style["color"] = "red";
}