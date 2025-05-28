"use strict";

/** @ts-ignore */
import * as THREE from 'three';

const delta_time = 1. / 30.
export class ChannelImageView {
    /**
     * 
     * @param {HTMLCanvasElement} canvas 
     * @param {Map<string,CachedChannelImage>} cached_channel_image
     */
    constructor(canvas, cached_channel_image) {
        this.canvas = canvas
        this.cached_channel_image = cached_channel_image

        const renderer = new THREE.WebGLRenderer({ antialias: false, canvas, alpha: true, powerPreference: "high-performance" })
        renderer.setPixelRatio(window.devicePixelRatio) // enable ssaa by *1.5 (bad for performance)
        this.renderer = renderer

        // set clear color based on theme color
        this.setClearColorFromBody();

        /** @type {SceneInfo[]} */
        this.sceneInfos = []

        // toggle drawing loop based on visibility of the plot container
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // entry.isIntersecting will be true if the element is visible in the viewport
                if (entry.isIntersecting) {
                    observer.unobserve(renderer.domElement)

                    for (let el of document.getElementsByClassName("channel-box-image")) {
                        if (!(el instanceof HTMLElement)) continue;

                        let scene = this._makeImageScene(el)

                        this.sceneInfos.push(scene)
                    }
                    this.draw()
                }
            });
        }, {
            // Optional: adjust threshold if needed
            threshold: 0.1  // 10% visibility is enough to start the animation loop
        });

        // Begin observing the canvas element
        observer.observe(renderer.domElement);

        this.draw()
    }

    setClearColorFromBody(){
        const themeBgColor=document.body.computedStyleMap().get("--text-color")?.toString();
        this.renderer.setClearColor(new THREE.Color(themeBgColor??'rgb(255,255,255)'), 1);
    }

    /**
     * get bounding box of element to draw canvas in
     * @returns {DOMRect}
     */
    getRect() {
        const parent = this.renderer.domElement.parentElement
        if (!parent) throw `parent is undefined`
        let parentRect = parent.getBoundingClientRect()
        return parentRect
    }

    /**
     * 
     * @param {THREE.WebGLRenderer} renderer 
     * @returns 
     */
    resizeRendererToDisplaySize(renderer) {
        const rect = this.getRect();
        const width = rect.width;
        const height = rect.height;

        const canvas = renderer.domElement.getBoundingClientRect()

        const needResize = canvas.width !== width || canvas.height !== height;
        if (needResize) {
            // console.log("set canvas size to",rect)
            renderer.setSize(width, height, false);
            renderer.domElement.style["width"] = `${width}px`
            renderer.domElement.style["height"] = `${height}px`
            renderer.domElement.style["top"] = `${rect.y}px`
            renderer.domElement.style["left"] = `${rect.x}px`
        }

        return needResize;
    }

    /**
     * 
     * @param {HTMLElement} elem 
     * @returns {SceneInfo}
     */
    _makeImageScene(elem) {
        const channelhandle = elem.parentElement?.getAttribute(`channelhandle`)
        if (!channelhandle) { const error = `${elem} has no attribute "channelhandle"`; console.error(error); throw error }

        const scene = new THREE.Scene();

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
        camera.position.z = 1;

        /** @type {SceneInfo} */
        const sceneInfo = { channelhandle, scene, camera, elem, mesh: undefined, img: undefined }

        let imageinfo = this.cached_channel_image.get(channelhandle)
        if (imageinfo) {
            this.updateTextureData(sceneInfo, imageinfo)
        }

        return sceneInfo;
    }

    /**
     * 
     * @param {CachedChannelImage} imageinfo 
     * @returns {{imgdata:Uint16Array|Uint8Array,datatype:THREE.UnsignedByteType|THREE.UnsignedShortType}}
     */
    _imageInfoToImage(imageinfo) {

        // 2. Create a DataTexture using the LuminanceFormat to preserve the single-channel data.
        let datatype
        let imgdata
        switch(imageinfo.bit_depth){
            case 8:{
                datatype = THREE.UnsignedByteType;
                imgdata = new Uint8Array(imageinfo.data);
                break;
            }
            case 16:{
                datatype = THREE.UnsignedShortType;
                imgdata = new Uint16Array(imageinfo.data);
                break;
            }
            default:
                throw `unknown bitdepth ${imageinfo.bit_depth} ${Array.from(Object.keys(imageinfo))}`;
        }

        return { imgdata, datatype }
    }

    /**
     * @param {CachedChannelImage} imageinfo
     * @returns {ChannelImageData}
     */
    _makeImage(imageinfo) {
        const WIDTH_DOWNSAMPLE_FACTOR = 2
        const HEIGHT_DOWNSAMPLE_FACTOR = 2

        let { imgdata, datatype } = this._imageInfoToImage(imageinfo)

        const width = imageinfo.width / WIDTH_DOWNSAMPLE_FACTOR
        const height = imageinfo.height / HEIGHT_DOWNSAMPLE_FACTOR
        const data = imgdata

        const texture = new THREE.DataTexture(
            imgdata,
            width,
            height,
            // single color channel (just defaults to red)
            // also, (unsigned) integer values
            THREE.RedIntegerFormat,
            datatype
        );
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.needsUpdate = true;

        // 3. Write custom shaders. The vertex shader passes the UV coordinates,
        // and the fragment shader reads the single-channel texture and outputs a grayscale color.
        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            // sample integer image
            uniform usampler2D uTexture;

            varying vec2 vUv;
            void main() {
                // sample from texture
                // red channel (based on format)
                // convert int value to float
                float lum = float(texture2D(uTexture, vUv).r);

                // adjust from [0;formatMax] to [0;1] space
                lum/=float(1<<(${imageinfo.bit_depth}));

                gl_FragColor = vec4(vec3(lum), 1.0);
            }
        `;

        // 4. Create a ShaderMaterial using the custom shaders and pass the texture via a uniform.
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture }
            },
            vertexShader,
            fragmentShader
        });

        // 5. Create a simple quad (a PlaneGeometry) on which the texture is drawn.
        const geometry = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geometry, material);

        /** @type {ChannelImageData} */
        const img = {
            width: imageinfo.width / WIDTH_DOWNSAMPLE_FACTOR,
            height: imageinfo.height / HEIGHT_DOWNSAMPLE_FACTOR,
            data: imgdata,
            texture,
            mesh,
        }

        return img
    }

    /**
     * 
     * @param {THREE.OrthographicCamera} camera 
     * @param {{width:number,height:number,center:{x:number,y:number},aspect_ratio?:number}} opt 
     */
    cameraFit(camera, opt) {
        let { width, height, center } = opt
        let target_aspect_ratio = opt.aspect_ratio ?? 1

        let current_aspect_ratio = width / height
        if (current_aspect_ratio > target_aspect_ratio) {
            height = height * current_aspect_ratio / target_aspect_ratio
        } else {
            width = width / current_aspect_ratio * target_aspect_ratio
        }

        camera.left = center.x - width / 2
        camera.right = center.x + width / 2
        camera.top = center.y + height / 2
        camera.bottom = center.y - height / 2
        //console.log("set camera bounding box to", center.x - width / 2, center.x + width / 2, center.y + height / 2, center.y - height / 2)
    }

    /**
     * Function to update the texture with 8 random byte values
     * 
     * @param {SceneInfo} sceneInfo
     * @param {CachedChannelImage} newimageinfo
     */
    updateTextureData(sceneInfo, newimageinfo) {
        let { imgdata, datatype } = this._imageInfoToImage(newimageinfo)

        const channelhandle = newimageinfo.info.channel.handle
        if ((sceneInfo.elem?.getBoundingClientRect().width ?? 0) == 0) {
            const new_element = Array.from(document.getElementsByClassName("channel-box-image")).find(
                e => e.parentElement?.getAttribute(`channelhandle`) == channelhandle
            )

            if (!(new_element instanceof HTMLElement)) { throw `element not found or invalid ${new_element}` }
            sceneInfo.elem = new_element
        }

        if (!sceneInfo.img) {
            sceneInfo.img = this._makeImage(newimageinfo)

            if (sceneInfo.img) {
                sceneInfo.scene.add(sceneInfo.img.mesh)
            }

            sceneInfo.mesh = sceneInfo.img?.mesh
        }
        if (!sceneInfo.img) { const error = `sceneInfo.img is null`; console.error(error); throw error }

        const texture = sceneInfo.img.texture
        if (!texture) { const error = ``; console.error(error); throw error }
        if (texture.image.data.length != imgdata.length) {
            console.error("length does not match", texture.image.data.length, imgdata.length)
            return
        }
        texture.image.data = imgdata
        texture.needsUpdate = true; // signal Three.js that the texture data has changed
    }

    /**
     * render one channel
     * @param {SceneInfo} sceneInfo 
     * @returns 
     */
    renderSceneInfo(sceneInfo) {
        const { channelhandle, scene, camera } = sceneInfo;

        const elem=document.getElementById(`channelview-item-${channelhandle}`);
        if(!elem){
            // console.error(`could not element with id 'channelview-item-${channelhandle}'`);
            return;
        }

        // get the viewport relative position of this element
        const { left, right, top, bottom, width, height } =
            elem.getBoundingClientRect();

        const isOffscreen =
            bottom < 0 ||
            top > this.getRect().height ||
            right < 0 ||
            left > this.getRect().width;

        if (isOffscreen) {
            return;
        }

        if (sceneInfo.img?.texture) {
            this.cameraFit(camera, {
                height: sceneInfo.img.height,
                width: sceneInfo.img.width,
                center: {
                    x: 0,//sceneInfo.img.width/2,
                    y: 0,//sceneInfo.img.height/2,
                },
                aspect_ratio: elem.getBoundingClientRect().width / elem.getBoundingClientRect().height
            })
        } else {
            camera.aspect = width / height;
        }
        camera.updateProjectionMatrix();

        const canvasRect = this.getRect()
        const positiveYUpBottom = canvasRect.y + canvasRect.height - bottom;
        this.renderer.setScissor(left, positiveYUpBottom, width, height);
        this.renderer.setViewport(left, positiveYUpBottom, width, height);

        this.renderer.render(scene, camera);
    }

    /**
     * @param {number} time deltatime
     */
    _render(time) {
        if (this.resizeRendererToDisplaySize(this.renderer)) {
            // (resizing happens inside resizeRendererToDisplaySize, and just returns
            // true to indicate if resizing has taken place. code path here may be used
            // to check that resizing actually just happens on demand)

            // console.log("resized");
        }

        this.renderer.setScissorTest(false);
        this.renderer.clear(true, true);
        this.renderer.setScissorTest(true);

        // update texture
        // updateTextureData(sceneInfos[1].img.texture);

        for (let sceneInfo of this.sceneInfos) {
            this.renderSceneInfo(sceneInfo);
        }
    }

    /**
     * draw (will schedule itself running again later)
     */
    draw() {
        this._render(delta_time)
        requestAnimationFrame(() => this.draw())
    }
}