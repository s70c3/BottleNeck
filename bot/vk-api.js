"use strict";
const request = require("request-promise-native");


/**
 * Параметры по умолчанию для VKapi
 */
const defaultParams = {
	v: "5.80",
	host: "https://api.vk.com",
	userAgent: "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 YaBrowser/18.6.1.770 Yowser/2.5 Safari/537.36",

	token: "",

	interval: 380,
	launched: false,
	stop: false,
	timeout: null,
	queue: [],
	
	restartLimit: 5,
	restartWait: 3000
}


/**
 * Класс задачи вызова API
 */
class Task {
	constructor(method, params = {}) {
		this.method = method;
		this.params = params;

		this.attempts = 0;

		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}

	addAttempt() {
		this.attempts += 1;
		return this.attempts;
	}

	toString() {
		let options = {};

		Object.entries(this.params).forEach(([key, value]) => {
			if (typeof value === "object")
				return (options[key] = String(value));

			options[key] = value;
		});

		return `API.${this.method}(${JSON.stringify(options)})`;
	}
}

/**
 * Проверяет задачу на предмет необходимости отдельного выполнения
 * @param {Task} task Объект задачи 
 */
function checkTask(task) {
	if (task.method.includes("execute")) return true;
	if (task.params.v || task.attempts > 0) return true;
	if (task.params.user_agent) return true;
	if (task.params.access_token) return true;
	return false;
}


class VKapi {
	constructor(opts = {}) {
		Object.assign(this, defaultParams, opts);
	}

	/**
	 * Выполняет execute запрос
	 * @param {object} params
	 */
	execute(params = {}) {
		return this.enqueue("execute", params);
	}

	/**
	 * Вызывает сохранённую процедуру
	 * @param {string} name
	 * @param {object} params
	 */
	procedure(name, params = {}) {
		return this.enqueue(`execute.${name}`, params);
	}

	/**
	 * Вызывает любой метод
	 * @param {string} method
	 * @param {object} params
	 */
	call(method, params = {}) {
		return this.enqueue(method, params);
	}

	/**
	 * Вызывает любой метод и выводит результаты в консоль
	 * @param {string} method
	 * @param {object} params
	 */
	log(method, params = {}) {
		this.enqueue(method, params).then(
			r => console.log(r),
			e => console.error(e)
		);
	}

	/**
	 * Добавляет новую задачу в конец очереди
	 * @param {any} method
	 * @param {any} params
	 */
	enqueue(method, params = {}) {
		let task = new Task(method, params);
		return this.callWithTask(task);
	}

	/**
	 * Добавляет задачу в начало очереди
	 * @param {Task} task
	 */
	requeue(task) {
		this.queue.unshift(task);
		this.worker();
	}

	/**
	 * Добавляет запрос к очереди
	 * @param {Task} task
	 */
	callWithTask(task) {
		this.queue.push(task);
		this.worker();
		return task.promise;
	}

	/**
	 * Выводит сообщение в консоль
	 * @param {any} type
	 * @param {any} message
	 */
	debugLog(type, message) {
		console[type]((new Date()).toLocaleString() + " " + message);
	}

	/**
	 * Обработчик очереди
	 */
	worker() {
		if (this.launched) return;
		this.launched = true;

		let work = () => {
			if (this.queue.length === 0 || this.stop) {
				clearTimeout(this.timeout);
				this.launched = false;
				return;
			}

			if (checkTask(this.queue[0])) {
				this.callMethod(this.queue.shift());
			} else {
				let tasks = [],
					chain = [];

				for (let i = 0; i < this.queue.length; i += 1) {
					if (checkTask(this.queue[i])) continue;

					let task = this.queue.splice(i, 1)[0];
					i -= 1;

					tasks.push(task);
					chain.push(String(task));

					if (tasks.length >= 25) break;
				}

				let task = new Task("execute", {
					code: `return [${tasks.join(",")}];`
				});

				this.callMethod(task);

				task.promise.then(
					r => {
						let errors = 0;

						r.response.forEach((response, i) => {
							if (response !== false) {
								tasks[i].resolve(response);
								return;
							}

							tasks[i].reject(r.errors[errors]);
							errors += 1;
						});
					},
					e => {
						tasks.forEach(task => task.reject(e))
					}
				).catch(e => console.error(e));
			}

			this.timeout = setTimeout(work, this.interval);
		}

		work();
	}
	
	/**
	 * Вызывает задачу
	 * @param {Task} task 
	 */
	callMethod(task) {
		let form = task.params || {},
			startTime = Date.now();

		form.lang = form.lang || "ru";
		form.v = form.v || this.v;
		form.access_token = form.access_token || this.token;
		if (form.access_token === "none") delete form.access_token;

		// Сжатие кода execute
		if (task.method === "execute" && form.code) {
			form.code = form.code.replace(/\t|\n/g, "");
		}

		form.invisible = 1;

		this.makeRequest({
			method: task.method,
			uri: `${this.host}/method/${task.method}`,
			form: form
		}).then(
			result => {
				if ("error" in result) {
					return this.errorHandler(task, result.error);
				}

				if (task.method.includes("execute")) {
					return task.resolve({
						response: result.response,
						errors: result.execute_errors
					});
				}

				task.resolve(("response" in result) ? result.response : result);
			}
		).catch(
			error => {
				!error.asyncOpType && console.log(error);

				if (task.addAttempt() <= this.restartLimit) {
					return setTimeout(() => {
						this.debugLog("info", `Запрос ${task.method} перезапущен ${task.attempts} раз`);
						this.requeue(task);
					}, this.restartWait);
				}

				this.debugLog("info", `Задача ${task.method} должна быть отклонена`);
				task.reject(error);
			}
		).catch(e => console.error(e));
	}

	/**
	 * Обработка ВК API ошибок
	 * @param {any} task Задача
	 * @param {any} error Ошибка API
	 */
	errorHandler(task, error) {
		/**
		 * method, error_code, error_msg, request_params,
		 * captcha_sid, captcha_img, redirect_uri
		 */

		let code = error.error_code;

		if (code === 5) {
			this.debugLog("error", `Ошибка авторизации ${error.error_msg}`);
			return task.reject(error);
		}
		
		if (code === 6) return this.requeue(task);

		task.reject(error);
	}

	/**
	 * Выполняет POST запрос к VK API
	 * @param {Object} opts Опции запроса
	 */
	makeRequest(opts) {
		return new Promise((resolve, reject) => {
			let form = opts.form,
				userAgent = form.user_agent || this.userAgent;

			delete form.user_agent;

			request({
				url: opts.uri,
				method: "post",
				formData: form,
				json: true,
				timeout: 8000,
				headers: {
					"User-Agent": userAgent
				}
			}).then(
				r => resolve(r),
				e => reject(e)
			);
		});
	}
}

module.exports = VKapi;