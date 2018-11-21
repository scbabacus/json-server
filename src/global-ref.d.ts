declare module NodeJS {
	interface Global {
		request: any;
		response: any;
		req: any;
		res: any;
		data: any;
		[variable:string]: any;
	}
}