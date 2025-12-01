export default class Utils {
    public static upperCaseFirstLetter(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}