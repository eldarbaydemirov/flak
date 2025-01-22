import React, { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import { Camera as CameraIcon, DownloadCloud, HelpCircle, X } from "lucide-react";
import axios from "axios";

function IrisTracker() {
  const base_url = "https://saglamgoz.az/";

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const faceMeshRef = useRef(null);

  const [irisImages, setIrisImages] = useState({});
  const [allImagesLoaded, setAllImagesLoaded] = useState(false);
  const [selectedIrisId, setSelectedIrisId] = useState("iris1");
  const [globalAlpha, setGlobalAlpha] = useState(0.4);
  const [isIrisOnCanvas, setIsIrisOnCanvas] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState("");
  const [availableIris, setAvailableIris] = useState([]);
  const [latestSite, setLatestSite] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [videoReady, setVideoReady] = useState(false); // NEW: state for video readiness
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);

  const selectedIrisIdRef = useRef(selectedIrisId);
  const globalAlphaRef = useRef(globalAlpha);

  useEffect(() => {
    selectedIrisIdRef.current = selectedIrisId;
  }, [selectedIrisId]);

  useEffect(() => {
    globalAlphaRef.current = globalAlpha;
  }, [globalAlpha]);

  useEffect(() => {
    const fetchIrises = async () => {
      try {
        const response = await axios.get(`${base_url}api/irises`);
        const formattedData = (response.data.data || []).map((iris) => ({
          ...iris,
          image: `${base_url}storage/${iris.image}`,
        }));
        setAvailableIris(formattedData);
        if (formattedData.length > 0) {
          setSelectedIrisId(formattedData[0].id);
          preloadIrisImages(formattedData)
            .then((imagesMap) => {
              setIrisImages(imagesMap);
              setAllImagesLoaded(true);
            })
            .catch((error) => {
              console.error("Error loading iris images:", error);
              setCameraError(
                "Failed to load iris images. Please refresh and try again."
              );
            });
        }
      } catch (err) {
        console.log("Failed to fetch irises data.");
      }
    };

    const fetchLatestSite = async () => {
      try {
        const response = await axios.get(`${base_url}api/latest-site`);
        if (response.data.success) {
          setLatestSite(response.data.data);
        } else {
          console.log(response.data.message || "No site found.");
        }
      } catch (err) {
        console.log("Failed to fetch latest site data.");
      }
    };

    // Call both functions
    fetchIrises();
    fetchLatestSite();
  }, []);

  useEffect(() => {
    if (allImagesLoaded) {
      initializeFaceMesh();
    }
  }, [allImagesLoaded]);

  const preloadIrisImages = async (formattedData) => {
    const promises = formattedData.map(({ id, image }) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ id, img });
        img.crossOrigin = "anonymous";
        img.onerror = () => reject(`Could not load image: ${id}`);
        img.src = image;
      });
    });
    const loaded = await Promise.all(promises);
    const imagesMap = {};
    loaded.forEach(({ id, img }) => {
      imagesMap[id] = img;
    });
    return imagesMap;
  };

  const initializeFaceMesh = () => {
    const faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      },
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults(onResults);
    faceMeshRef.current = faceMesh;
  };

  const handleUserMedia = () => {
    setIsCameraLoading(false);
    startMediapipeCamera();
  };

  const handleUserMediaError = (err) => {
    console.error("Webcam error:", err);
    setIsCameraLoading(false);
    setFirstFrameRendered(true);
    setCameraError(
      "Could not access camera. Please allow permissions or check your device settings."
    );
  };

  const startMediapipeCamera = () => {
    if (!webcamRef.current || !webcamRef.current.video) {
      console.warn("No webcam video found.");
      return;
    }

    try {
      const camera = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          if (faceMeshRef.current) {
            await faceMeshRef.current.send({
              image: webcamRef.current.video,
            });
          }
        },
        width: 1280,
        height: 720,
      });
      camera.start().catch((err) => {
        console.error("Failed to start camera feed:", err);
        setCameraError(
          "Could not start camera. Please allow camera access or try a different device."
        );
      });
    } catch (err) {
      console.error("Camera initialization error:", err);
      setCameraError(
        "Could not initialize camera. Please check your device permissions."
      );
    }
  };

  const onResults = (results) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const currentIrisId = selectedIrisIdRef.current;
    const currentAlpha = globalAlphaRef.current;

    canvas.width = webcamRef.current.video.videoWidth;
    canvas.height = webcamRef.current.video.videoHeight;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    if (!firstFrameRendered) {
      setFirstFrameRendered(true);
    }
    let irisDrawn = false;
    if (results.multiFaceLandmarks?.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      if (irisImages[currentIrisId]) {
        drawIrisOverlay(ctx, landmarks, currentIrisId, currentAlpha);
        irisDrawn = true;
      }
    }
    ctx.restore();
    setIsIrisOnCanvas(irisDrawn);
  };

  const LEFT_EYE_BOUNDARY = [
    33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7,
  ];

  const RIGHT_EYE_BOUNDARY = [
    263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390,
    249,
  ];

  function clipEyeRegion(ctx, landmarks, eyeIndices, canvasWidth, canvasHeight) {
    ctx.beginPath();
    eyeIndices.forEach((idx, i) => {
      const x = landmarks[idx].x * canvasWidth;
      const y = landmarks[idx].y * canvasHeight;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.clip();
  }

  const drawIrisOverlay = (ctx, landmarks, irisId, alpha) => {
    const leftIris = landmarks.slice(468, 473);
    const rightIris = landmarks.slice(473, 478);

    drawIrisTexture(ctx, leftIris, irisImages[irisId], landmarks, true, alpha); // left eye
    drawIrisTexture(ctx, rightIris, irisImages[irisId], landmarks, false, alpha);
  };

  const drawIrisTexture = (ctx, irisPoints, irisImage, landmarks, isLeftEye, alpha) => {
    if (!irisPoints || irisPoints.length < 5) return;

    const { width, height } = ctx.canvas;

    let sumX = 0,
      sumY = 0;
    irisPoints.forEach((pt) => {
      sumX += pt.x;
      sumY += pt.y;
    });
    const centerX = (sumX / irisPoints.length) * width;
    const centerY = (sumY / irisPoints.length) * height;

    let totalRadius = 0;
    irisPoints.forEach((pt) => {
      const dx = pt.x * width - centerX;
      const dy = pt.y * height - centerY;
      totalRadius += Math.sqrt(dx * dx + dy * dy);
    });
    const averageRadius = totalRadius / irisPoints.length;

    const scaleFactor = 1.45;
    const finalRadius = averageRadius * scaleFactor;
    const finalDiameter = finalRadius * 2;
    const finalX = centerX - finalRadius;
    const finalY = centerY - finalRadius;

    const eyeBoundaryIndices = isLeftEye ? LEFT_EYE_BOUNDARY : RIGHT_EYE_BOUNDARY;

    ctx.save();

    clipEyeRegion(ctx, landmarks, eyeBoundaryIndices, width, height);

    ctx.beginPath();
    ctx.arc(centerX, centerY, finalRadius, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();

    ctx.globalAlpha = alpha;

    ctx.drawImage(irisImage, finalX, finalY, finalDiameter, finalDiameter);

    ctx.restore();
  };

  useEffect(() => {
    if (canvasRef.current && webcamRef.current?.video) {
      const video = webcamRef.current.video;
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;
    }
  }, [webcamRef.current]);

  const handleCaptureScreenshot = async () => {
    if (!canvasRef.current || !webcamRef.current || isCapturing) return;

    setIsCapturing(true);
    setCountdown(4);

    const capturePromise = new Promise((resolve) => {
      setTimeout(async () => {
        await captureScreenshot();
        resolve();
      }, 500);
    });

    const countdownPromise = new Promise((resolve) => {
      const countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === 1) {
            clearInterval(countdownInterval);
            resolve();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    await Promise.all([capturePromise, countdownPromise]);

    setShowScreenshotModal(true);
    setIsCapturing(false);
  };

  const captureScreenshot = async () => {
    return new Promise((resolve) => {
      if (!canvasRef.current || !webcamRef.current || !latestSite?.logo || isCapturing)
        return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const video = webcamRef.current.video;
      const scaleFactor = 2;
      canvas.width = video.videoWidth * scaleFactor;
      canvas.height = video.videoHeight * scaleFactor;

      ctx.scale(-1, 1);
      ctx.drawImage(
        video,
        -canvas.width / scaleFactor,
        0,
        canvas.width / scaleFactor,
        canvas.height / scaleFactor
      );
      ctx.scale(-1, 1);

      const logoImage = new Image();
      axios
        .get(latestSite.logo, { responseType: "blob" })
        .then((response) => {
          const url = URL.createObjectURL(response.data);
          logoImage.src = url;
        })
        .catch((error) => {
          console.error("Failed to fetch logo image:", error);
        });

      logoImage.onload = () => {
        const logoWidth = 300;
        const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
        ctx.drawImage(logoImage, canvas.width / 2 - logoWidth / 2, 20, logoWidth, logoHeight);

        canvas.toBlob((blob) => {
          if (!blob) {
            console.error("Failed to generate blob from canvas.");
            resolve();
            return;
          }
          const dataUrl = URL.createObjectURL(blob);
          setScreenshot(dataUrl);
          resolve();
        }, "image/png");
      };

      logoImage.onerror = () => {
        console.error("Failed to load logo image.");
        resolve();
      };
    });
  };

  const handleShareScreenshot = () => {
    if (!screenshot) return;

    if (navigator.share) {
      fetch(screenshot)
        .then((res) => res.blob())
        .then((blob) => {
          const file = new File([blob], "saglamgoz.png", { type: "image/png" });
          navigator.share({
            title: "SaglamGoz Image",
            text: "Check out this image from SaglamGoz!",
            files: [file],
          })
            .then(() => console.log("Screenshot shared successfully"))
            .catch((error) => console.error("Error sharing screenshot:", error));
        })
        .catch((error) => console.error("Error creating shareable file:", error));
    } else {
      const link = document.createElement("a");
      link.href = screenshot;
      link.download = "saglamgoz.png";
      link.click();
    }
  };

  const [isDropdownOpen, setIsDropdownOpen] = useState({
    iris: false,
    density: false,
  });

  const toggleDropdown = (type) => {
    setIsDropdownOpen((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const handleIrisSelect = (id) => {
    setSelectedIrisId(id);
    setIsDropdownOpen((prev) => ({ ...prev, iris: false }));
  };

  const handleDensitySelect = (value) => {
    setGlobalAlpha(value);
    setIsDropdownOpen((prev) => ({ ...prev, density: false }));
  };
    

  return (
    <div className="iris-tracker-container">
      <div className="header">
        <div className="d-flex">
          <img src={latestSite ? latestSite.logo : ""} alt="logo" />
        </div>
        <button className="info-button" onClick={() => setShowInfo(true)}>
          <HelpCircle size={24} />
        </button>
      </div>

      {cameraError && <p className="error-message">{cameraError}</p>}

      {/* Optional text messages outside the overlay */}
      {!allImagesLoaded && (
        <p className="loader-message">Loading iris images... Please wait.</p>
      )}
      {allImagesLoaded && isCameraLoading && (
        <p className="loader-message">
          Accessing camera... Please allow camera permissions if prompted.
        </p>
      )}

      <div className="camera-container" style={{ position: "relative" }}>
      {(isCameraLoading || !allImagesLoaded || !firstFrameRendered) && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>
            {!allImagesLoaded
              ? "Loading iris images... Please wait."
              : !firstFrameRendered
              ? "Starting camera... please wait."
              : "Accessing camera... Please wait."}
          </p>
        </div>
      )}

      <Webcam
        ref={webcamRef}
        audio={false}
        onUserMedia={handleUserMedia}
        onUserMediaError={handleUserMediaError}
        videoConstraints={{ facingMode: "user" }}
        style={{ visibility: "hidden", transform: "scaleX(-1)" }}
      />

        <canvas ref={canvasRef} className="video-canvas" />

        <button
          className="capture-button"
          onClick={handleCaptureScreenshot}
          disabled={!isIrisOnCanvas || isCapturing}
        >
          {countdown > 0 ? <span>{countdown}</span> : <CameraIcon size={24} />}
        </button>

        {/* Remaining controls and modals */}
        <div className="controls-overlay">
          <div className="controls-wrapper">
            <div className="dropdown">
              <button onClick={() => toggleDropdown("iris")} className="dropdown-button">
                <img
                  src={
                    availableIris.find((iris) => iris.id === selectedIrisId)
                      ?.image
                  }
                  alt={
                    availableIris.find((iris) => iris.id === selectedIrisId)
                      ?.title
                  }
                  className="dropdown-image"
                />
                <span>
                  {availableIris.find((iris) => iris.id === selectedIrisId)
                    ?.title}
                </span>
              </button>
              {isDropdownOpen.iris && (
                <div className="dropdown-menu">
                  {availableIris.map((iris) => (
                    <div
                      key={iris.id}
                      className={`dropdown-item ${
                        selectedIrisId === iris.id ? "selected" : ""
                      }`}
                      onClick={() => handleIrisSelect(iris.id)}
                    >
                      <img src={iris.image} alt={iris.title} className="dropdown-image" />
                      <span>{iris.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dropdown">
              <button onClick={() => toggleDropdown("density")} className="dropdown-button">
                <span>Density :</span>
                <span>
                  {globalAlpha === 0.2
                    ? "Low"
                    : globalAlpha === 0.4
                    ? "Medium"
                    : "High"}
                </span>
              </button>
              {isDropdownOpen.density && (
                <div className="dropdown-menu">
                  {[
                    { value: 0.2, label: "Low" },
                    { value: 0.4, label: "Medium" },
                    { value: 0.7, label: "High" },
                  ].map((option) => (
                    <div
                      key={option.value}
                      className={`dropdown-item ${globalAlpha === option.value ? "selected" : ""}`}
                      onClick={() => handleDensitySelect(option.value)}
                    >
                      <span>{option.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showInfo && (
        <div className="info-modal">
          <div className="info-content">
            <h2>Welcome to SağlamGöz Eyes simulator!</h2>
            <p>
              This simulator gives you a real-time overview of how your eyes could
              look with SağlamGöz colors.
            </p>
            <br />
            <p>
              <strong>How to use it?</strong>
            </p>
            <ul>
              <li>💡 Ensure you're in a bright environment (sunlight gives the best results)</li>
              <li>🤳 Stay ~40cm away from your camera</li>
              <li>📸 Keep steady, take a picture and try out all our colors!</li>
            </ul>
            <button onClick={() => setShowInfo(false)}>Ok</button>
          </div>
        </div>
      )}

    {showScreenshotModal && screenshot && (
      <div className="screenshot-modal">
        <div className="screenshot-content">
          <img
            src={screenshot}
            alt="SaglamGoz iris"
            onLoad={(e) => e.target.classList.add("loaded")}
            crossOrigin="anonymous"
          />
          <div className="screenshot-buttons">
            <button onClick={() => setShowScreenshotModal(false)}>
              <X />
            </button>
            <button onClick={handleShareScreenshot}>
              <DownloadCloud />
            </button>
          </div>
        </div>
      </div>
    )}

    </div>
  );
}

export default IrisTracker;
