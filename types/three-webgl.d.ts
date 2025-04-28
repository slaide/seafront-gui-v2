declare module "three/addons/capabilities/WebGL.js" {
    class WebGL {
        static isWebGL2Available(): boolean;
        static getWebGL2ErrorMessage(): HTMLElement;
    }
}
export default WebGL;
